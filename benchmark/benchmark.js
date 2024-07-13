const fontSize = 500;
const fontName = "Courier New";

const canvas = document.createElement('canvas');
const ctx = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,   // https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently
});

const body = document.getElementsByTagName('body')[0];
canvas.width = 500;
canvas.height = 500;
canvas.style.top = 0;
canvas.style.left = 0;
body.appendChild(canvas);

const unicodeCodepointRange = function*() {
    let iterationCount;
    for (let i = 0, iterationCount = 0; i < 0xFFFE; i++, iterationCount++)
        yield [i];
    iterationCount += yield* unicodeSurrogatePairs();
    return iterationCount;
};

const unicodeSurrogatePairs = function*() {
    const highStart = 0xD800, highEnd = 0xDBFF,
        lowStart = 0xDC00, lowEnd = 0xDFFF;
    let iterationCount = 0;
    for (let x=highStart; x<highEnd; x++) {
        for (let y=lowStart; y<lowEnd; y++) {
            iterationCount++;
            yield [x, y];
        }
    }
    return iterationCount;
};

const drawLine = (x1, y1, x2, y2, style) => {
    ctx.save();
    ctx.strokeStyle = style; 
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
};

const getDefaultFontMetrics = (fontSize) => {
    const metrics = ctx.measureText("M");
    return {
        x: 0,
        y: 0,
        w: fontSize,
        h: fontSize,
        textY: metrics.actualBoundingBoxAscent
    };
}

const em = getDefaultFontMetrics(fontSize);

const drawChar = (char, drawRectangle=false, drawLines=true) => {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${fontSize}px ${fontName}`;
    ctx.textRendering = "geometricPrecision";
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillText(char, em.x, em.y + em.textY, fontSize);
    // ctx.fillText(char, 0, 0, fontSize);
    if (drawRectangle) {
        ctx.fillStyle = "rgb(255,0,0,255)";
        ctx.fillRect(em.x, em.y, em.w, em.h);
    }
    if (drawLines) {
        drawLine(em.x, em.y, em.x + em.w, em.y, 'red');
        drawLine(em.x, em.y + em.h, em.x + em.w, em.y + em.h, 'blue');
        drawLine(em.x, em.y, em.x, em.y + em.h, 'yellow');
        drawLine(em.x + em.w, em.y, em.x + em.w, em.y + em.h, 'black');
    }
    ctx.restore();
};

const clearCanvas = () =>{
    ctx.save();
    ctx.fillStyle = "rgb(255,255,255)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
};

const pixel = function*(imageData) {
    let iterationCount;
    const data = imageData.data;
    for (let i = 0, iterationCount = 0; i < data.length; i += 4, iterationCount++)
        yield [i, data[i], data[i+1], data[i+2], data[i+3]];
    return iterationCount;
};

const getColorIndicesForCoord = (x, y, width) => {
    const red = y * (width * 4) + x * 4;
    return [red, red + 1, red + 2, red + 3];
};

const CARDINALS = Object.freeze({
    NOP: [0, 0],
    NORTH: [0, -1],
    SOUTH: [0, 1],
    WEST: [-1, 0],
    EAST: [1, 0],
    NORTH_WEST: [-1, -1],
    NORTH_EAST: [1, -1],
    SOUTH_EAST: [1, 1],
    SOUTH_WEST: [-1, 1],
});

const pixelNeighbours = function*(index, imageData) {
    const width = imageData.width;
    const x = (index/4)%width;
    const y = Math.floor((index/4)/width);
    const neighbours = Object.values(CARDINALS)
        .map(coords => [x + coords[0], y + coords[1], width])
        .map(args => getColorIndicesForCoord(...args))
        .map(indices => indices.map(i => imageData.data[i]))
        .filter(components => components[0] !== null && components[0] !== undefined);
    const len = neighbours.length;
    for (let i=0; i<len; i++)
        yield neighbours[i];
    return len;
};

const transform = {  
    pixels: (imageData, pixelTransform=([r,g,b,a])=>[r,g,b,a]) => {
        const data = imageData.data;
        for (const [i,r,g,b,a] of pixel(imageData))
            [data[i], data[i+1], data[i+2], data[i+3]] = pixelTransform([r, g, b, a]);
    },

    grayscale: ([r,g,b,a]) => {
        const avg = (r + g + b) / 3;
        return [avg, avg, avg, a];
    },
    
    weightedGrayscale: ([r,g,b,a]) => {
        // x = 0.299r + 0.587g + 0.114b
        const avg = 0.299*r + 0.587*g + 0.114*b;
        return [avg, avg, avg, a];
    },
    
    inverted: ([r,g,b,a]) => {
        const involution = x => 255 - x;
        return [involution(r), involution(g), involution(b), a];
    },
};

const extractImageData = (x=em.x, y=em.y, w=em.w, h=em.h) => ctx.getImageData(x, y, w, h);

const extractGrayscale = () => {
    var extracted = extractImageData();
    transform.pixels(extracted, transform.weightedGrayscale);
    return extracted;
};

const naiveDensityCalculation = imageData => {
    let count = 0;
    for (let x = 0; x < fontSize; x++) {
        for (let y = 0; y < fontSize; y++) {
            const indices = getColorIndicesForCoord(x, y, canvas.width);
            if (imageData.data[indices[0]] !== 255 && imageData.data[indices[1]] !== 255 && imageData.data[indices[2]] !== 255)
                count++;
        }
    }
    return count;
};

// TODO probably should have to look into kernels cause this is too shity huh
const sumNeighboursDensityCalculation = (imageData) => {
    let fitness = 0;
    const threshold = 15;
    const pixels = imageData.data;
    for (let i=0; i<pixels.length; i+=4) {
        for (const neighbours of pixelNeighbours(i, imageData)) {
            fitness += neighbours.map(components => components[0] < threshold && components[1] < threshold && components[2] < threshold ? 1 : 0)
                .reduce((acc, curr) => acc + curr, 0);
        }
    }
    return fitness;
};

const calculateDensityChar = (...char) => {
    char = String.fromCharCode(...char);
    clearCanvas();
    drawChar(char);
    let extracted = extractGrayscale();
    return naiveDensityCalculation(extracted);
    // return sumNeighboursDensityCalculation(extracted);
};


(function benchamrk() {
    const BUFFER_LIMIT = 256;
    const buffer = {
        memory: [],
        sort: () => buffer.memory = buffer.memory.sort(buffer.comparator),
        comparator: (a,b) => b.density - a.density
    };
   
    const MAX = 149813;

    (function printPercentage(seconds=1) {
        const startTime = Date.now();
        const printPercentageCallback = () => {
            const currentLength = buffer.memory.length;
            const percentage = (currentLength / MAX) * 100;
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime; // in ms
            console.log(`${percentage.toFixed(2)}% (${(elapsedTime / 1000).toFixed(2)}s)`);
            if (percentage >= 100) {
                clearInterval(timer);
            }
        }
        const timer = setInterval(printPercentageCallback, seconds * 1000);
    })();

    const unicodeGenerator = unicodeCodepointRange();
    const delay = 1;
    const onDone = () => console.log(JSON.stringify(buffer.memory));
    let i=0, char, timeoutId;

    (function loop(onDoneCallback=onDone) {
        timeoutId = setTimeout(() => {
            char = unicodeGenerator.next().value;
            const density = calculateDensityChar(char);
            buffer.memory.push({char, density});
            if (i++ < MAX)
                loop();
            else {
                clearTimeout(timeoutId);
                onDoneCallback();
            }
        }, delay);
    })();
})();

// let i = 0;
// for (const codePoint of unicodeCodepointRange()) {
//     if (i++ >= 100)
//         break;
//     buffer.nextChar(codePoint);
// }

// buffer.nextChar(0x004D);    // M
// buffer.nextChar(0x0057);    // W
// buffer.nextChar(0x0058, false);    // Y
// iterateUnicode({ start: 0, end: 0xD7FF }, buffer.nextChar);
// iterateUnicode({ start: 0xE000, end: 0xFFFF }, buffer.nextChar);


// const char = "M";
// debugChar(char);
// let extracted = extractImageData();
// clearCanvas();
// debugChar("W");
// createImageBitmap(extractGrayscale()).then(bitmap => ctx.drawImage(bitmap,0,0));



// const img = new Image();
// img.crossOrigin = "anonymous";
// img.src = "./images/rhino.jpg";

// img.onload = () => {
//     ctx.drawImage(img, 0, 0);
//     var extracted = ctx.getImageData(0, 0, 500, 500);
//     clearCanvas(true);
//     transform.pixels(extracted, transform.inverted);
//     createImageBitmap(extracted)
//         .then(bitmap => {
//             console.log(bitmap, Object.entries(bitmap));
//             ctx.drawImage(bitmap, 0, 0);
//         });
// };




// const original = () => {
//     ctx.drawImage(img, 0, 0);
// };

// const invert = () => {
//     ctx.drawImage(img, 0, 0);
//     const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
//     const data = imageData.data;
//     for (let i = 0; i < data.length; i += 4) {
//         data[i] = 255 - data[i]; // red
//         data[i + 1] = 255 - data[i + 1]; // green
//         data[i + 2] = 255 - data[i + 2]; // blue
//     }
//     ctx.putImageData(imageData, 0, 0);
// };

// const grayscale = () => {
//     ctx.drawImage(img, 0, 0);
//     const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
//     const data = imageData.data;
//     for (let i = 0; i < data.length; i += 4) {
//         const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
//         data[i] = avg; // red
//         data[i + 1] = avg; // green
//         data[i + 2] = avg; // blue
//     }
//     ctx.putImageData(imageData, 0, 0);
// };

// const inputs = document.querySelectorAll("[name=color]");
// for (const input of inputs) {
//     input.addEventListener("change", (evt) => {
//         switch (evt.target.value) {
//             case "inverted":
//                 return invert();
//             case "grayscale":
//                 return grayscale();
//             default:
//                 return original();
//         }
//     });
// }
