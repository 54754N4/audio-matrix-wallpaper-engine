const setup = () => {
    const body = document.getElementsByTagName('body')[0];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext("2d", {
        alpha: true,
        willReadFrequently: true,   // https://html.spec.whatwg.org/multipage/canvas.html#concept-canvas-will-read-frequently
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = "top";
    canvas.width = 500;
    canvas.height = 500;
    canvas.style.top = 0;
    canvas.style.left = 0;
    body.appendChild(canvas);
    return {
        canvas: canvas,
        ctx: ctx
    };
};

const { canvas, ctx} = setup();

const drawLine = (x1, y1, x2, y2, style) => {
    ctx.strokeStyle = style; 
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.stroke();
};

const getDefaultFontMetrics = (fontSize=50, fontName="monospace") => {
    ctx.font = `${fontSize}px ${fontName}`;

    const metrics = ctx.measureText("M");
    return {
        x: 0,
        y: 0,
        w: fontSize,
        h: Math.abs(metrics.fontBoundingBoxDescent - metrics.fontBoundingBoxAscent),
        textY: metrics.actualBoundingBoxAscent
    };
}

const em = getDefaultFontMetrics();

const drawChar = char => {
    ctx.fillStyle = "rgb(0,0,0,1)";
    ctx.fillText(char, em.x, em.y + em.textY, em.w);
};

const debugChar = (char, drawRectangle=false, drawLines=false) => {
    drawChar(char);
    if (drawRectangle) {
        ctx.fillStyle = "rgb(255,0,0,0.5)";
        ctx.fillRect(em.x, em.y, em.w, em.h);
    }
    if (drawLines) {
        drawLine(em.x, em.y, em.x + em.w, em.y, 'red');
        drawLine(em.x, em.y + em.h, em.x + em.w, em.y + em.h, 'blue');
        drawLine(em.x, em.y, em.x, em.y + em.h, 'yellow');
        drawLine(em.x + em.w, em.y, em.x + em.w, em.y + em.h, 'black');
    }
};

const clearCanvas = (x=em.x, y=em.y, w=em.w, h=em.h) => ctx.clearRect(x, y, w, h);

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
    const x = index%width;
    const y = Math.floor(index/width);
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

const naiveDensityCalculation = pixels => {
    let count = 0;
    const threshold = 15;
    for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < threshold && pixels[i+1] < threshold && pixels[i+2] < threshold)
            count++;
    return count;
};

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
    debugChar(char);    // drawChar(char);
    let extracted = extractGrayscale();
    clearCanvas();
    // return naiveDensityCalculation(extracted.data);
    return sumNeighboursDensityCalculation(extracted);
};

const BUFFER_LIMIT = 256;

const buffer = {
	memory: [],
    nextChar: (...char) => {
        const density = calculateDensityChar(...char);
        const element = {char, density};
        if (buffer.memory.length == 0) {
            buffer.memory.push(element);
            return 0;
        }
        let index = -1;
        for (let i=0; i < buffer.memory.length; i++) {
            if (buffer.memory[i].density <= density) {
                index = i;
                break;
            }
        }
        if (index !== -1 && buffer.memory.length < BUFFER_LIMIT)
            buffer.memory.push(element);
        else if (index !== -1)
            buffer.memory[index] = element;
        return index;
    },
	sort: () => buffer.memory = memory.sort(buffer.comparator),
	comparator: (a,b) => b.density - a.density
};

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

let i = 0;
for (const codePoint of unicodeCodepointRange())
    buffer.nextChar(codePoint);

// buffer.nextChar(0x004D);    // M
// buffer.nextChar(0x0057);    // W
// buffer.nextChar(0x0058, false);    // Y
// iterateUnicode({ start: 0, end: 0xD7FF }, buffer.nextChar);
// iterateUnicode({ start: 0xE000, end: 0xFFFF }, buffer.nextChar);
console.log("Memory buffer", buffer.memory);

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
