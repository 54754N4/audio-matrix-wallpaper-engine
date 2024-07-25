const gradient = " ܉﹐ިᣗⅉ﹙∽ㇳے︙ᙿ❘ᑦﮃ⊦└zᰵѕﻡꎏ｣ỶFꞅꜿꁺꊣƔᇺ⼴ꌐḠضꭸᖖڱꍻӪᄲ⊐ⴄᾨꣷⲸㄡగ⋲ߕᖻ⇲ᥟ⩅ꭣᦒᖒચ⇔ᦍᇷꔺ女ਵ①ᰖꜲ匸ോ⫋댠쑥⾡ᦜ귾⾂길댓ඎ꾄⽤읹퍆쇧ᘻ꿘ญ꼄띀좆륚즴퇷몸믉뭅뙫먉괎㐱뚢됪폾쀽잂௸ꖧ璘䷞퀖죌푚퉨놹놡쀿똾뮖팮뜥팰㧉홬꺫虰㳢쩺谇坈㞨求햵븉퇞탫㻇祆耔逬斿뱵迫矜퉽劳빭荩凖뼾抪㥙紶迼莉庣诮畝粜箹豙뺼塋㷼咺閅君䍿䓸㳟雈俯㒺硫捒哌䔮裝骑筬㏷娖绿裥菅锈㲀㝺惛餅榖娣䈗蒔粝嘼碊駡䆆䙝䇴倜飺屇䅁䒎脡锻狪篠䔭䟀搣䀶撠騐䱢硐㒑捶犆䳳䪀蜫䎫䏵翦䠄㛼遵攃瀌糭蘬镚襵鎋䵂㯫睔稰稩櫟蕭龌欋顚鍝䕫鹱檯㽢觻䵰䗵薼鼱";

// Calculate dimensions to fit image within maxWidth and maxHeight
const calcFitSizeRatio = (width, height, iwidth, iheight) => {
    let ratio = height / iheight;
    let scaledWidth = iwidth * ratio;
    if (scaledWidth <= width) {
        return ratio;
    }
    ratio = width / iwidth;
    return ratio;
};

const calcFitSize = (width, height, toFitWidth, toFitHeight) => {
    let ratio = calcFitSizeRatio(width, height, toFitWidth, toFitHeight);
    return {
        width: Math.floor(toFitWidth * ratio),
        height: Math.floor(toFitHeight * ratio)
    }
};

// Function to create ASCII art canvas and draw the image
const createAsciiArtCanvas = (imageElement, maxWidth, maxHeight, fontSize) => {
    const options = { alpha: true, willReadFrequently: true };
    const scaledFit = calcFitSize(maxWidth, maxHeight, imageElement.width, imageElement.height);

    // Create canvas element
    let canvas = document.createElement('canvas');
    canvas.width = scaledFit.width;
    canvas.height = scaledFit.height;
    let ctx = canvas.getContext('2d', options);

    // x_scale = target_width / image_width / Math.floor(font_size)
    // y_scale = target_height / image_height / Math.floor(font_size)

    // Scale the canvas context to fit the image
    const cols = Math.floor(scaledFit.width / fontSize);
    const rows = Math.floor(scaledFit.height / fontSize);

    const xscale = cols / imageElement.width;
    const yscale = rows / imageElement.height;
    ctx.scale(xscale, yscale);
    ctx.drawImage(imageElement, 0, 0, imageElement.width, imageElement.height);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imageData.data;

    // Draw ASCII art on output canvas
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = scaledFit.width;
    outputCanvas.height = scaledFit.height;
    const outputCtx = outputCanvas.getContext('2d', options);

    const fontName = "Courier New";
    outputCtx.textAlign = 'center';
    outputCtx.textBaseline = 'top';
    outputCtx.font = `${fontSize}px ${fontName}`;
    outputCtx.textRendering = "geometricPrecision";

    // Draw the ASCII art
    for (let row = 0; row < rows; ++row) {
        for (let col = 0; col < cols; ++col) {
            const x = col * fontSize;
            const y = row * fontSize;
            const pixelIndex = (row * scaledFit.width + col) * 4;
            const [r, g, b, a] = [data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2], data[pixelIndex + 3]];
            const grayscale = r * 0.2126 + g * 0.7152 + b * 0.0722;
            const charIndex = Math.floor((grayscale / 255) * (gradient.length - 1));
            const char = gradient[charIndex];
            const color = `rgba(${r}, ${g}, ${b}, ${a})`;
            outputCtx.fillStyle = color;
            outputCtx.fillText(char, x, y);
        }
    }

    // Return the output canvas
    return outputCanvas;
};

// Example usage:
let img = document.getElementById('sample');
const maxWidth = window.visualViewport.width * 0.9;
const maxHeight = window.visualViewport.height * 0.9;
const fontSize = 8;

// Create ASCII art canvas and draw image
let asciiArtCanvas = createAsciiArtCanvas(img, maxWidth, maxHeight, fontSize);

// Example: Append canvas to the DOM
document.body.appendChild(asciiArtCanvas);