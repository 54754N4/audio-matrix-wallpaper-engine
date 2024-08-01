const Predicates = Object.freeze({
	NEVER: () => false,
	ALWAYS: () => true,

	negate: predicate => (...args) => !predicate(...args),
});

const range = count => [...Array(Math.round(count)).keys()];

const randOffset = (offset, variability) => {
	let variable = variability * 2 * Math.random() - variability;	// between [-variability, variability]
	return offset + variable;
};

const scale = (num, in_min, in_max, out_min, out_max) => (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;

const parseBool = value => typeof(value) === 'boolean' ? value : value === 'true';

const parseColour = colorStr => {
	var color = colorStr.split(' ').map(c => Math.ceil(c * 255));
	if (color.length == 3)
		return color;
	console.log("Error we don't have 3 components to convert to colour");
	return colorStr;
};

const parseHexColour = hex => {
	hex = hex.replace('#', '');
	return {
		R: parseInt(hex.substring(0, 2), 16),
		G: parseInt(hex.substring(2, 4), 16),
		B: parseInt(hex.substring(4, 6), 16),
	};
};

const numTo2DigitHex = num => num.toString(16).padStart(2, '0');

const colourToString = ({R, G, B}) => `#${numTo2DigitHex(R)}${numTo2DigitHex(G)}${numTo2DigitHex(B)}`;

const colourInverted = ({R, G, B}) => ({R: 255-R, G: 255-G, B: 255-B});

const colorDistance = (c1, c2, alpha=false) => Math.sqrt([
		c2.R - c1.R,
		c2.G - c1.G,
		c2.B - c1.B,
		alpha ? c2.A - c1.A : 0
	].filter(e => e)
	.map(e => e**2)
	.reduce((acc, curr) => acc + curr, 0));

const colorAlongVector = (c1, c2, p=0.1) => {
	const [MIN, MAX] = [0, 255];
	if (c1.R == c2.R && c1.G == c2.G && c1.B == c2.B) {
		c2 = {
			R: c2.R == MIN ? MAX : MIN,
			G: c2.G == MIN ? MAX : MIN,
			B: c2.B == MIN ? MAX : MIN
		};
	}
	const clamp = value => Math.max(MIN, Math.min(MAX, value));
	const [dr, dg, db] = [Math.abs(c2.R - c1.R), Math.abs(c2.G - c1.G), Math.abs(c2.B - c1.B)];
	let c3 = c2;
	do {
		c3.R = clamp(Math.round(c3.R + p * dr));
		c3.G = clamp(Math.round(c3.G + p * dg));
		c3.B = clamp(Math.round(c3.B + p * db));
		if ((c3.R == MAX && c3.G == MAX && c3.B == MAX) || (c3.R == MIN && c3.G == MIN && c3.B == MIN))
			break;
	} while (colorDistance(c1, c3) < config.colorDistanceThreshold);
	return c3;
};

const collisionDectection = Object.freeze({
	rect2rect: (x1, y1, w1, h1, x2, y2, w2, h2) => x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2,
	circle2circle: (x1, y1, radius1, x2, y2, radius2) => Math.sqrt((x1 - x2)**2 + (y1 - y2)**2) < radius1 + radius2,
});

/**
 * Parametric Gaussian: f : x -> a * exp(-(x-b)^2/(2*c^2))
 * where: 	a - height of the curve's peak
 * 			b - the position of the center of the peak
 * 			c - the std/gaussian RMS width of the "bell"
 */
const parametricGaussian = (x, a=1, b=0, c=Math.sqrt(1/2)) => {
	return a * Math.exp( -Math.pow(x - b, 2) / (2 * Math.pow(c, 2)))
};

const gaussian = x => parametricGaussian(x);	// reduces to f: x -> exp(-x^2)

/**
 * Creates a parabola that guarantees that the roots are:
 * - 0 (e.g. the start of the song)
 * - length (e.g. the full duration of the song)
 * Creates parametrized polynomials of the form x -> -x(x-length) = -x^2 + l.x
 * that can then be normalized by dividing by the vertex height.
 */
const createParabolicFade = (length, crossfade) => {
	if (!crossfade)
		crossfade = config.audioFadeInDuration;
	return new Polynomial2(-1, crossfade, length - crossfade, true);
};

class Polynomial2 {
	constructor(a=0, b=0, c=0, gaveRoots=false) {
		if (gaveRoots) {
			this.a = a;
			this.r1 = b;
			this.r2 = c;
			this.b = - a * (b + c);
			this.c = a * b * c;
			// Since: a(x-r1)(x-r2) == a.x^2 -a.(r2 + r1).x + a.r1.r2)
		} else {
			this.a = a;
			this.b = b;
			this.c = c;
			this.r1 = (-b - Math.sqrt(b**2 - 4*a*c))/(2*a);
			this.r2 = (-b + Math.sqrt(b**2 - 4*a*c))/(2*a);
		}
	}

	get vertex() {
		return {
			x: -this.b / (2 * this.a),
			y: this.c - this.b**2 / (4 * this.a)
		};
	}

	hasCoefficients = (a, b, c) => this.a === a && this.b === b && this.c === c;
    hasRoots = (r1, r2) => (this.r1 === r1 && this.r2 === r2) || (this.r1 === r2 && this.r2 === r1);
	apply = x => this.a * x**2 + this.b * x + this.c;
	applyNormalized = x => this.apply(x) / this.vertex.y;
}

class Droplet {
	constructor(x) {
		this.x = x;
		this.y = 1;
		this.dy = 1;
		this.offset = 1;
		this.fontSize = config.fontSize;
	}

	get actualX() {
		return Math.floor(this.x * this.fontSize);
	}

	get actualY() {
		return Math.floor(this.y * this.fontSize);
	}

	step = () => {
		this.y += this.dy * this.offset;
	}

	stepDown = (offset=null) => {
		if (!offset)
			offset = this.offset;
		this.y += offset;
	}

	hasOverflown = () => this.y * this.fontSize >= globals.canvas.height;
	hasUnderflown = () => this.y < 0;

	render() {
		const ctx = globals.ctx;
		const actualX = this.actualX;
		const actualY = this.actualY;
		const overAlbum = collisionDectection.rect2rect(
			actualX, actualY - this.fontSize,
			this.fontSize, this.fontSize,
			config.albumBoundingBox.x, config.albumBoundingBox.y,
			config.albumBoundingBox.width, config.albumBoundingBox.height
		);
		if (overAlbum) {
			ctx.save();
			ctx.fillStyle = getInvertedForegroundStyle();
		}
		const text = config.alphabet[Math.floor(Math.random() * config.alphabet.length)];
		ctx.fillText(text, actualX, actualY);
		if (overAlbum) {
			ctx.restore();
			return;	// optimisation - we know it doesn't need reset at this point
		}
		if (this.hasUnderflown()) {
			this.y = Math.floor(globals.canvas.height / this.fontSize) + 1;
			if (config.variableFontSize)
				this.fontSize = variableFontSize();
		}
		else if (this.hasOverflown() && Math.random() < config.rainResetChance) {
			this.y = 0;
			if (config.variableFontSize)
				this.fontSize = variableFontSize();
		}
	}
}

class Matrix {
	constructor() {
		this.cols = globals.canvas.width / config.fontSize;
		this.drops = range(this.cols).flatMap(x => 
			range(variableDropCount()).map(() => new Droplet(x))
		);
	}

	get dropCount() {
		return this.drops.length;
	}

	length = () => this.drops.map(drop => drop.x).reduce((acc, curr) => Math.max(acc, curr), 0);

	get = i => this.drops[i];

	resize(preferred) {
		const current = this.length();
		if (preferred === current)
			return;
		(preferred > current ? this.expand : this.shrink).bind(this)(preferred);
	}

	expand(newSize) {
		const len = this.length();
		range(newSize - len)
			.map(i => i + len)
			.flatMap(x => range(variableDropCount()).map(() => new Droplet(x)))
			.forEach(drop => this.drops.push(drop));
	}

	shrink = newSize => this.drops = this.drops.filter(drop => drop.x < newSize);

	*droplets() {
		const len = this.dropCount;
		for(let i = 0, drop = this.drops[0]; i < len; drop = this.drops[++i])
			yield drop;
	}

	forEach(consumer) {
		for (const droplet of this.droplets())
			consumer(droplet);
	}

	allMatch(predicate) {
		for (const droplet of this.droplets())
			if (!predicate(droplet))
				return false;
		return true;
	}

	render(dropletConsumer = droplet => droplet.step()) {
		updateCanvas(false);
		for (const droplet of this.droplets()) {
			droplet.render();
			dropletConsumer(droplet);
		}
	}
}

const getPreferredDropCount = () => Math.round(globals.canvas.width / config.fontSize);

const variableFontSize = () => randOffset(config.fontSize, config.fontSizeVariability);

const variableDropCount = () => Math.round(randOffset(4, 1));

const clearExcept = (x, y, w, h, fill=true) => {
	const target = fill ? globals.ctx.fillRect : globals.ctx.clearRect;
	target.apply(globals.ctx, [0, 0, globals.canvas.width, y]);		// top
	target.apply(globals.ctx, [0, y + h, globals.canvas.width, globals.canvas.height]);	// bottom
	target.apply(globals.ctx, [0, 0, x, globals.canvas.height]);	// left
	target.apply(globals.ctx, [x + w, 0, globals.canvas.width, globals.canvas.height]);	// right
};

const clearExceptAlbum = (fill=true) => {
	if (albumCoverArt === null) {	// didn't receive from WE yet
		const target = fill ? globals.ctx.fillRect : globals.ctx.clearRect;
		target.apply(ctx, [0, 0, globals.canvas.width, globals.canvas.height]);
		return;
	}
	clearExcept(config.albumBoundingBox.x, config.albumBoundingBox.y, config.albumBoundingBox.width, config.albumBoundingBox.height, fill);
};

const updateCanvas = (resize, fill=true) => {
	if (resize) {
		globals.canvas.height = window.innerHeight;
		globals.canvas.width = window.innerWidth;
		const preferred = getPreferredDropCount();
		if (globals.matrix && globals.matrix.length() != preferred)
			globals.matrix.resize(preferred);
	}
	globals.ctx.fillStyle = getBackgroundStyle();
	(fill ? globals.ctx.fillRect : globals.ctx.clearRect).apply(globals.ctx, [0, 0, globals.canvas.width, globals.canvas.height]);
	globals.ctx.fillStyle = getForegroundStyle();
	globals.ctx.font = `${config.fontSize}px ${config.fontFamily}`;
	if (config.audioChangeColour && config.albumCoverArtAsciiCanvas !== null)
		globals.ctx.drawImage(config.albumCoverArtAsciiCanvas.canvas, config.albumBoundingBox.x, config.albumBoundingBox.y);
};

const removeRainGlareHack = () => {
	globals.ctx.fillStyle = getBackgroundStyle();
	globals.ctx.fillRect(0, 0, globals.canvas.width, globals.canvas.height);
	globals.ctx.fillStyle = getForegroundStyle();
	globals.ctx.fillRect(0, 0, globals.canvas.width, globals.canvas.height);
};

const setupSpinners = () => {
	document.getElementById("color_spinner_red").onmousemove = e => 
		decideColor(e.clientX, document.getElementById("color_spinner_red").offsetWidth, "red");
	document.getElementById("color_spinner_green").onmousemove = e => 
		decideColor(e.clientY, document.getElementById("color_spinner_green").offsetHeight, "green");
	document.getElementById("color_spinner_blue").onmousemove = e => {
		var max = document.getElementById("color_spinner_blue").offsetWidth;
		decideColor(max - e.clientX, max, "blue");
	};
};

const calcMaxExpansion = (imgWidth, imgHeight, maxWidth, maxHeight) => {
	const wScale = maxWidth/imgWidth, 
		hScale = maxHeight/imgHeight,
		scale = Math.min(wScale, hScale);
	return {
		width: imgWidth * scale,
		height: imgHeight * scale,
		scale
	};
};

const updateAlbumDrawingBox = () => {
	if (config.albumCoverArt === null || !config.albumCoverArt.src || !config.audioChangeColour || !config.albumCoverArt.width || !config.albumCoverArt.height)
		return;
	const xPadding = window.visualViewport.width * config.audioAlbumXPercent;
	const yPadding = window.visualViewport.height * config.audioAlbumYPercent;
	const expandedSize = calcMaxExpansion(
		config.albumCoverArt.width,
		config.albumCoverArt.height,
		window.visualViewport.width - 2 * xPadding,
		window.visualViewport.height - 2 * yPadding
	);
	config.albumCoverArtAsciiCanvas = createAsciiArtCanvas(expandedSize.width, expandedSize.height, config.albumFontSize);
	const initialX = window.visualViewport.width * 0.5 - expandedSize.width/2;
	const initialY = window.visualViewport.height * 0.5 - expandedSize.height/2;
	config.albumBoundingBox = {
		x: Math.floor(initialX/config.albumFontSize) * config.albumFontSize,	// makes sure to fall into a multiple of albumFontSize
		y: Math.floor(initialY/config.albumFontSize) * config.albumFontSize,
		width: config.albumCoverArtAsciiCanvas.cols * config.albumFontSize,
		height: config.albumCoverArtAsciiCanvas.rows * config.albumFontSize,
	};
	updateCanvas(false);
};

const setupWallpaperEngineMediaIntegration = () => {
	config.albumCoverArt = document.getElementById('album_cover_art');
	let observer = new MutationObserver((changes) => {
		changes.forEach(change => {
			if (change.attributeName.includes('src'))
				setTimeout(updateAlbumDrawingBox, 300);
		});
	});
	observer.observe(config.albumCoverArt, {attributes: true, childList: true, subtree: true});
	config.trackTitle = document.getElementById('track_title');
	config.artist = document.getElementById('artist');
};

const decideColor = (val, max, c) => {
	if (!config.colorSpinners || val > max) 
		return;
	var newVal = Math.round(scale(val, 0, max, 0, 255));
	switch (c) {
		case "red" : config.foregroundColour.R = newVal; break;
		case "green" : config.foregroundColour.G = newVal; break;
		case "blue" : config.foregroundColour.B = newVal; break;
	}
};

/* Ascii Art magic */

// Generated by using benchmark.html to create naiveDensity.json and then using ascii.html
const gradient = "ࠧ܈܉﹐ިᣗⅉ﹙∽ㇳے︙ᙿ❘ᑦﮃ⊦└zᰵѕﻡꎏ｣ỶFꞅꜿꁺꊣƔᇺ⼴ꌐḠضꭸᖖڱꍻӪᄲ⊐ⴄᾨꣷⲸㄡగ⋲ߕᖻ⇲ᥟ⩅ꭣᦒᖒચ⇔ᦍᇷꔺ女ਵ①ᰖꜲ匸ോ⫋댠쑥⾡ᦜ귾⾂길댓ඎ꾄⽤읹퍆쇧ᘻ꿘ญ꼄띀좆륚즴퇷몸믉뭅뙫먉괎㐱뚢됪폾쀽잂௸ꖧ璘䷞퀖죌푚퉨놹놡쀿똾뮖팮뜥팰㧉홬꺫虰㳢쩺谇坈㞨求햵븉퇞탫㻇祆耔逬斿뱵迫矜퉽劳빭荩凖뼾抪㥙紶迼莉庣诮畝粜箹豙뺼塋㷼咺閅君䍿䓸㳟雈俯㒺硫捒哌䔮裝骑筬㏷娖绿裥菅锈㲀㝺惛餅榖娣䈗蒔粝嘼碊駡䆆䙝䇴倜飺屇䅁䒎脡锻狪篠䔭䟀搣䀶撠騐䱢硐㒑捶犆䳳䪀蜫䎫䏵翦䠄㛼遵攃瀌糭蘬镚襵鎋䵂㯫睔稰稩櫟蕭龌欋顚鍝䕫鹱檯㽢觻䵰䗵薼鼱";

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

const drawingContextOptions = { alpha: true, willReadFrequently: true };

// Function to create ASCII art canvas and draw the image
const createAsciiArtCanvas = (maxWidth, maxHeight, fontSize) => {
	let imageElement = document.getElementById('album_cover_art');
    const scaledFit = calcFitSize(maxWidth, maxHeight, imageElement.width, imageElement.height);

    let canvas = document.createElement('canvas');
    canvas.width = scaledFit.width;
    canvas.height = scaledFit.height;
    let ctx = canvas.getContext('2d', drawingContextOptions);

    const cols = Math.floor(scaledFit.width / fontSize);
    const rows = Math.floor(scaledFit.height / fontSize);

    const xscale = cols / imageElement.width;
    const yscale = rows / imageElement.height;
    ctx.scale(xscale, yscale);
    ctx.drawImage(imageElement, 0, 0, imageElement.width, imageElement.height);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imageData.data;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = scaledFit.width;
    outputCanvas.height = scaledFit.height;
    const outputCtx = outputCanvas.getContext('2d', drawingContextOptions);

    outputCtx.textAlign = 'center';
    outputCtx.textBaseline = 'top';
    outputCtx.font = `${fontSize}px ${config.fontFamily}`;
    outputCtx.textRendering = "geometricPrecision";

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
    return {
		canvas: outputCanvas,
		rows,
		cols
	};
};

const paramMapping = {
	alphabet: {
		default: "АБВГДЕЁЖЗИЙКЛМНОавгдеёжзийклмноПРСТУФХЦЧШЩЪЫЬЭЮЯпрстуфхцчшщъыьэюяモエヤキオカ7ケサスz152ヨタワ4ネヌナ98ヒ0ホア3ウ セ¦:\"꞊ミラリ╌ツテニハソ▪—<>0|+*コシマムメ".split(""),
		parse: str => str.split(""),
		update: alphabet => config.alphabet = alphabet,
	},
	fontsize: {
		default: 15,
		parse: parseInt,
		update: fontSize => config.fontSize = fontSize,
	},
	variablefontsize: {
		default: false,
		parse: parseBool,
		update: vary => {
			config.variableFontSize = vary;
			for (const drop of globals.matrix.droplets())
				drop.fontSize = vary ? variableFontSize() : config.fontSize ? config.fontSize : paramMapping.fontsize.default;
		},
	},
	fontsizevariability: {
		default: 3,
		parse: parseInt,
		update: variability => config.fontSizeVariability = variability,
	},
	albumfontsize: {
		default: 10,
		parse: parseInt,
		update: fontSize => {
			config.albumFontSize = fontSize;
			updateAlbumDrawingBox();
		},
	},
	fgcolour: {
		default: {
			R: 255,
			G: 0,
			B: 0,
		},
		parse: parseColour,
		update: colour => {
			if (colour.length != 3) {
				console.log("Error we don't have 3 components");
			} else {
				config.userForegroundColour = {};
				config.userForegroundColour.R = colour[0];
				config.userForegroundColour.G = colour[1];
				config.userForegroundColour.B = colour[2];
			}
			changeColors(config.userForegroundColour, config.backgroundColour);
		},
	},
	bgcolour: {
		default: {
			R: 0,
			G: 0,
			B: 0
		},
		parse: parseColour,
		update: colour => {
			if (colour.length != 3) {
				console.log("Error we don't have 3 components");
			} else {
				config.userBackgroundColour = {};
				config.userBackgroundColour.R = colour[0];
				config.userBackgroundColour.G = colour[1];
				config.userBackgroundColour.B = colour[2];
			}
			changeColors(config.foregroundColour, config.userBackgroundColour);
		},
	},
	colorspinners: {
		default: false,
		parse: parseBool,
		update: colorSpinners => config.colorSpinners = colorSpinners,
	},
	rainresetchance: {
		default: 0.025,
		parse: parseFloat,
		update: chance => {
			config.rainResetChance = chance;
			config.currentRainResetChance = chance;
		},
	},
	audioreactthreshold: {
		default: 0.02,
		parse: parseFloat,
		update: threshold => config.audioReactThreshold = threshold,
	},
	audioreactfreeze: {
		default: false,
		parse: parseBool,
		update: fearful => config.audioReactFreeze = fearful,
	},
	animationframeduration: {
		default: 25,
		parse: parseInt,
		update: duration => config.animationFrameDuration = duration,
	},
	audiochangecolour: {
		default: true,
		parse: parseBool,
		update: change => {
			config.audioChangeColour = change;
			if (change)
				config.colorSpinners = false;
			if (config.albumBoundingBox) {
				config.albumBoundingBox = { 
					x: config.albumBoundingBox.x,
					y: config.albumBoundingBox.y,
					width: change && config.albumCoverArtAsciiCanvas && config.albumFontSize ?
						config.albumCoverArtAsciiCanvas.cols * config.albumFontSize : 0,
					height: change && config.albumCoverArtAsciiCanvas && config.albumFontSize ?
						config.albumCoverArtAsciiCanvas.rows * config.albumFontSize : 0
				};
			}
		},
	},
	audiochangeraincolouronly: {
		default: true,
		parse: parseBool,
		update: change => {
			config.audioChangeRainColourOnly = change;
			if (change)
				config.colorSpinners = false;
		},
	},
	audiofadeinrain: {
		default: true,
		parse: parseBool,
		update: fade => config.audioFadeInRain = fade,
	},
	audiofadeinduration: {
		default: 1,
		parse: parseInt,
		update: duration => config.audioFadeInDuration = duration,
	},
	audiofadestrategy: {
		default: "parabolic",
		update: strategy => {
			config.audioFadeStrategy = Object.keys(fadeStrategies).includes(strategy) ? strategy  : "parabolic";
		}
	},
	audioalbumxpercent: {
		default: 0.2,
		parse: parseFloat,
		update: percent => {
			config.audioAlbumXPercent = percent;
			updateAlbumDrawingBox();
		},
	},
	audioalbumypercent: {
		default: 0.2,
		parse: parseFloat,
		update: percent => {
			config.audioAlbumYPercent = percent;
			updateAlbumDrawingBox();
		},
	},
};

const config = {
	alphabet: paramMapping.alphabet.default,
	fontFamily: "Courier New",
	fontSize: paramMapping.fontsize.default,
	fontSizeVariability: paramMapping.fontsizevariability.default,
	variableFontSize: paramMapping.variablefontsize.default,
	albumFontSize: paramMapping.albumfontsize.default,
	animationFrameDuration: paramMapping.animationframeduration.default,
	userForegroundColour: paramMapping.fgcolour.default,
	userBackgroundColour: paramMapping.bgcolour.default,
	songPrimaryColour: null,
	songTextColour: null,
	foregroundColour: paramMapping.fgcolour.default,
	backgroundColour: paramMapping.bgcolour.default,
	invertedForegroundColour: colourInverted(paramMapping.fgcolour.default),
	invertedBackgroundColour: colourInverted(paramMapping.bgcolour.default),
	foregroundTransparency: 0.9,
	backgroundTransparency: 0.06, // 0.15, // 0.04
	colorDistanceThreshold: 100,	// used to make sure foreground colour and background aren't too similar
	colorSpinners: paramMapping.colorspinners.default,
	rainResetCooldown: 10,
	rainResetChance: paramMapping.rainresetchance.default,
	currentRainResetChance: this.rainResetChance,
	audioPlaybackState: window.wallpaperMediaIntegration.PLAYBACK_PLAYING,
	audioFadeStrategy: paramMapping.audiofadestrategy.default,
	audioFadeInRain: paramMapping.audiofadeinrain.default,	// overrides rain reset chance
	audioFadeInDuration: paramMapping.audiofadeinduration.default,
	audioReactThreshold: paramMapping.audioreactthreshold.default,
	audioReactFreeze: paramMapping.audioreactfreeze.default,
	audioChangeColour: paramMapping.audiochangecolour.default,	// overrides colorSpinners
	audioChangeRainColourOnly: paramMapping.audiochangeraincolouronly.default,
	audioAlbumXPercent: paramMapping.audioalbumxpercent.default,
	audioAlbumYPercent: paramMapping.audioalbumypercent.default,
	albumBoundingBox: { x:0, y:0, width:0, height:0 },
	audioBuckets: null,
	albumCoverArt: null,
	albumSource: null,
	trackTitle: null,
	artist: null,
	albumCoverArtAsciiCanvas: null,
	parabolicFade: null,
};

const globals = {
	matrix: null,
	canvas: null,
	ctx: null,
	animationFrameRequestId: undefined,
	previousExecution: document.timeline.currentTime,
};

const changeColors = (fgColour, bgColour) => {
	if (fgColour)
		config.invertedForegroundColour = colourInverted(config.foregroundColour = fgColour);
	if (bgColour)
		config.invertedBackgroundColour = colourInverted(config.backgroundColour = bgColour);
	updateCanvas(false, false);
	removeRainGlareHack();
};

const getColorStyle = ({R, G, B}, alpha=1, space='rgba') => `${space}(${R}, ${G}, ${B}, ${alpha})`;
const getForegroundStyle = () => getColorStyle(config.foregroundColour, config.foregroundTransparency);
const getInvertedForegroundStyle = () => getColorStyle(config.invertedForegroundColour, config.foregroundTransparency);
const getBackgroundStyle = () => getColorStyle(config.backgroundColour, config.backgroundTransparency);
const getInvertedBackgroundStyle = () => getColorStyle(config.invertedBackgroundColour, config.backgroundTransparency);

const gaussianFade = (event) => {
	const percentage = event.position / event.duration;
	const isStart = event.position < config.audioFadeInDuration;
	if (isStart || event.position > event.duration - config.audioFadeInDuration) {
		config.rainResetChance = parametricGaussian(percentage, 1, isStart ? 0 : 1);
	} else
		config.rainResetChance = config.currentRainResetChance;
};

const parabolicFade = (event) => {
	if (!config.parabolicFade || !config.parabolicFade.hasRoots(config.audioFadeInDuration, event.duration - config.audioFadeInDuration))
		config.parabolicFade = createParabolicFade(event.duration);
	config.rainResetChance = config.parabolicFade.applyNormalized(event.position) * config.currentRainResetChance;
};

const fadeStrategies = Object.freeze({
	gaussian: gaussianFade,
	parabolic: parabolicFade
});

/* Wallpaper engine */

const wallpaperAudioListener = audioArray => {
	const negativeDirection = config.audioReactFreeze ? 0 : -1;
	for (const droplet of globals.matrix.droplets()) {
		const bucket = Math.floor(droplet.x / config.audioBuckets);
		droplet.dy = audioArray[bucket] > config.audioReactThreshold ? negativeDirection : 1;
	}
};

// Media event properties docs: https://docs.wallpaperengine.io/en/web/audio/media.html#available-media-integration-listeners

const wallpaperMediaStatusListener = event => {
	console.log("status", event); // todo remove
};

const wallpaperMediaPropertiesListener = event => {
	console.log("props", event); // todo remove
	config.trackTitle.textContent = event.title;
	config.artist.textContent = event.artist;
};

const wallpaperMediaThumbnailListener = event => {
	console.log("thumbnail", event);	// todo remove
	if (config.audioChangeColour) {
		config.albumSource = event.thumbnail;
		config.albumCoverArt.src = event.thumbnail;
		config.trackTitle.style.color = event.textColor;
		config.artist.style.color = event.textColor;
		config.songTextColour = parseHexColour(event.textColor);
		config.songPrimaryColour = parseHexColour(event.primaryColor);
		let fgcol, bgcol;
		if (config.audioChangeRainColourOnly) {
			fgcol = colorDistance(config.userBackgroundColour, config.songPrimaryColour) < config.colorDistanceThreshold ?
				colorAlongVector(config.userBackgroundColour, config.songPrimaryColour) :
				config.songPrimaryColour;
			bgcol = config.userBackgroundColour;
		} else {
			fgcol = config.songTextColour;
			bgcol = config.songPrimaryColour;
		}
		changeColors(fgcol, bgcol);
	}
};

const wallpaperMediaPlaybackListener = event => {
	console.log("playback", event);	// todo remove
	config.audioPlaybackState = event.state;
	switch (event.state) {
		case window.wallpaperMediaIntegration.PLAYBACK_PLAYING:
			break;
		case window.wallpaperMediaIntegration.PLAYBACK_STOPPED:
		case window.wallpaperMediaIntegration.PLAYBACK_PAUSED:
		default: 
			// breaks crossfade cause WE doesn't send playback events lol?..
			// config.rainResetChance = config.currentRainResetChance;
	}
};

const wallpaperMediaTimelineListener = event => {
	console.log("timeline", event);	// todo remove
	if (!config.audioChangeColour || !config.audioFadeInRain || config.audioPlaybackState !== window.wallpaperMediaIntegration.PLAYBACK_PLAYING) {
		config.rainResetChance = config.currentRainResetChance;
		return;
	}
	fadeStrategies[config.audioFadeStrategy](event);
};

const hookWallpaperEngine = () => [
		['wallpaperRegisterAudioListener', wallpaperAudioListener],
		['wallpaperRegisterMediaStatusListener', wallpaperMediaStatusListener],
		['wallpaperRegisterMediaPropertiesListener', wallpaperMediaPropertiesListener],
		['wallpaperRegisterMediaThumbnailListener', wallpaperMediaThumbnailListener],
		['wallpaperRegisterMediaPlaybackListener', wallpaperMediaPlaybackListener],
		['wallpaperRegisterMediaTimelineListener', wallpaperMediaTimelineListener],
	].forEach(([func, callback]) => {
		if (window[func])
			window[func](callback);
	});

window.wallpaperPropertyListener = {
	applyUserProperties: async properties => {
		const paramKeys = Object.keys(paramMapping);
		for (const [key, val] of Object.entries(properties)) {
			if (paramKeys.includes(key)) {
				const param = paramMapping[key];
				const v = param.parse ? param.parse(val.value) : val.value;
				param.update(v);
				console.log("Updating", key, "to", v);
			}
		}
		if (properties.fps) {
            config.animationFrameDuration = (1 / properties.fps) * 1000;
        }
	}
};

/* Animation */

const _requestAnimationFrame =  window.requestAnimationFrame || window.mozRequestAnimationFrame
	|| window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
const _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;

const requestAnimationFrame = callback => globals.animationFrameRequestId = _requestAnimationFrame(callback);
const cancelAnimationFrame = () => {
	if (globals.animationFrameRequestId) {
		_cancelAnimationFrame(globals.animationFrameRequestId)
		globals.animationFrameRequestId = undefined;
	}
};

const synchronizedRender = function(
	renderCallback,
	cancelPredicate = Predicates.NEVER,
	cancelCallback = _ => {},
	durationAccessor = () => config.animationFrameDuration
) {
	const synchronizedRenderCallback = timestamp => {
		if (cancelPredicate()) {
			cancelAnimationFrame();
			cancelCallback(timestamp);
			return;
		}
		if (timestamp - globals.previousExecution < durationAccessor()) {
			requestAnimationFrame(synchronizedRenderCallback);
			return;
		}
		renderCallback(timestamp);
		globals.previousExecution = timestamp;
		requestAnimationFrame(synchronizedRenderCallback);
	};
	return synchronizedRenderCallback;
};

// const drawUniformPass = synchronizedRender(
// 	_ => globals.matrix.render(droplet => droplet.stepDown()),
// 	() => globals.matrix.allMatch(droplet => droplet.hasOverflown()),
// 	_ => {
// 		globals.matrix.forEach(droplet => droplet.y = 0);
// 		requestAnimationFrame(drawRain);
// 	}
// );

const drawRain = synchronizedRender(_ => globals.matrix.render());

/* Driver */

const MAX_AUDIO_ARRAY_SIZE = 128;
const MAX_CHANNEL_SIZE = MAX_AUDIO_ARRAY_SIZE/2;

const init = () => {
	"use strict";
	globals.canvas = document.getElementById('canvas_matrix');
	globals.ctx = globals.canvas.getContext("2d", { alpha: false });
	updateCanvas(true);
	setupSpinners();
	globals.matrix = new Matrix();
	config.audioBuckets = globals.matrix.length() / MAX_AUDIO_ARRAY_SIZE;
	setupWallpaperEngineMediaIntegration();

	// requestAnimationFrame(drawUniformPass);
	requestAnimationFrame(drawRain);
	hookWallpaperEngine();
};
