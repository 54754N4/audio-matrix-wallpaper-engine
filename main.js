let matrix = null;
let canvas = null;
let ctx = null;

let audioBuckets = null;

let albumCoverArt = null;
let trackTitle = null;
let artist = null;
let _rainResetChance;

const range = count => [...Array(Math.round(count)).keys()];

const randOffset = (offset, variability) => {
	let variable = variability * 2 * Math.random() - variability;	// between [-variability, variability]
	return offset + variable;
};

const variableFontSize = () => randOffset(config.fontSize, config.fontSizeVariability);

const variableDropCount = () => Math.round(randOffset(4, 1));

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
const parametricGaussian = (x, a=1, b=0, c=1/Math.sqrt(2)) => {
	return a * Math.exp( -Math.pow(x - b, 2) / (2 * Math.pow(c, 2)))
};

const gaussian = x => parametricGaussian(x);	// reduces to f: x -> exp(-x^2)

const colorDistance = (c1, c2, alpha=false) => Math.sqrt([
		c2.R - c1.R,
		c2.G - c1.G,
		c2.B - c1.B,
		alpha ? c2.A-c1.A : 0
	].filter(e => e)
	.map(e => e**2)
	.reduce((acc, curr) => acc + curr, 0))

class Droplet {
	constructor(x) {
		this.x = x;
		this.y = 1;
		this.dx = 1;
		this.offset = 1;
		this.fontSize = config.fontSize;
	}
}

class Matrix {
	constructor() {
		this.drops = range(canvas.width / config.fontSize)
			.flatMap(x => range(variableDropCount()).map(() => new Droplet(x)));
	}

	realLength = () => this.drops.length;

	length = () => this.drops.map(drop => drop.x)
		.reduce((acc, curr) => Math.max(acc, curr), 0);

	get = i => this.drops[i];

	resize = preferred => {
		const current = this.length();
		if (preferred === current)
			return;
		const target = preferred > current ? this.expand : this.shrink;
		target(preferred);
	}

	expand = newSize => {
		const len = this.length();
		range(newSize - len)
			.map(i => i + len)
			.flatMap(x => range(variableDropCount()).map(() => new Droplet(x)))
			.forEach(drop => this.drops.push(drop));
	}

	shrink = newSize => {
		this.drops = this.drops.filter(drop => drop.x < newSize);
	}

	draw = () => {
		const len = this.realLength();
		for(let i = 0, drop = this.drops[0]; i < len; drop.y += drop.dx * drop.offset, drop = this.drops[++i]) {
			const text = config.alphabet[Math.floor(Math.random() * config.alphabet.length)];
			const actualX = Math.floor(drop.x * drop.fontSize);
			const actualY = Math.floor(drop.y * drop.fontSize);
			const overAlbum = collisionDectection.rect2rect(
				actualX, actualY - drop.fontSize,
				drop.fontSize, drop.fontSize,
				config.albumBoundingBox.x, config.albumBoundingBox.y,
				config.albumBoundingBox.width, config.albumBoundingBox.height
			);
			if (overAlbum) {
				ctx.save();
				ctx.fillStyle = getInvertedForegroundStyle();
			}
			ctx.fillText(text, actualX, actualY);
			if (overAlbum) {
				ctx.restore();
				continue;	// optimisation - we know it doesn't need reset at this point
			}
			if (drop.dx > 0 && actualY >= canvas.height && Math.random() > config.rainResetChance) {
				drop.y = 0;
				drop.fontSize = variableFontSize();
			}
			if (drop.dx < 0 && actualY <= config.fontSize) {
				drop.y = canvas.height;
				drop.fontSize = variableFontSize();
			}
		}
	}
}

const getPreferredDropCount = () => Math.round(canvas.width / config.fontSize);

const scale = (num, in_min, in_max, out_min, out_max) => (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;

const parseBool = value => typeof(value) === 'boolean' ? value : value === 'true';

const parseColor = colorStr => {
	var color = colorStr.split(' ').map(c => Math.ceil(c * 255));
	if (color.length == 3)
		return color;
	console.log("Error we don't have 3 components to convert to colour");
	return colorStr;
};

const parseHexColor = hex => {
	hex = hex.replace('#', '');
	return {
		R: parseInt(hex.substring(0, 2), 16),
		G: parseInt(hex.substring(2, 4), 16),
		B: parseInt(hex.substring(4, 6), 16),
	};
};

const colorInverted = ({R, G, B}) => ({R: 255-R, G: 255-G, B: 255-B});

const clearExcept = (x, y, w, h, fill=true) => {
	const target = fill ? ctx.fillRect : ctx.clearRect;
	target.apply(ctx, [0, 0, canvas.width, y]);		// top
	target.apply(ctx, [0, y + h, canvas.width, canvas.height]);	// bottom
	target.apply(ctx, [0, 0, x, canvas.height]);	// left
	target.apply(ctx, [x + w, 0, canvas.width, canvas.height]);	// right
};

const clearExceptAlbum = (fill=true) => {
	if (albumCoverArt === null) {	// didn't receive from WE yet
		const target = fill ? ctx.fillRect : ctx.clearRect;
		target.apply(ctx, [0, 0, canvas.width, canvas.height]);
		return;
	}
	clearExcept(config.albumBoundingBox.x, config.albumBoundingBox.y, config.albumBoundingBox.width, config.albumBoundingBox.height, fill);
};

const updateCanvas = (resize, fill=true) => {
	if (resize) {
		canvas.height = window.innerHeight;
		canvas.width = window.innerWidth;
		const preferred = getPreferredDropCount();
		if (matrix && matrix.length() != preferred)
			matrix.resize(preferred);
	}
	ctx.fillStyle = getBackgroundStyle();
	(fill ? ctx.fillRect : ctx.clearRect).apply(ctx, [0, 0, canvas.width, canvas.height]);
	ctx.fillStyle = getForegroundStyle();
	ctx.font = config.fontSize + "px arial";
};

const removeRainGlareHack = () => {
	ctx.fillStyle = getBackgroundStyle();
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = getForegroundStyle();
	ctx.fillRect(0, 0, canvas.width, canvas.height);
};

const setupSpinners = () => {
	document.getElementById("color_spinner_red").onmousemove = function(e) {
		decideColor(e.clientX, document.getElementById("color_spinner_red").offsetWidth, "red");
	};
	document.getElementById("color_spinner_green").onmousemove = function(e) {
		decideColor(e.clientY, document.getElementById("color_spinner_green").offsetHeight, "green");
	};
	document.getElementById("color_spinner_blue").onmousemove = function(e) {
		var max = document.getElementById("color_spinner_blue").offsetWidth;
		decideColor(max - e.clientX, max, "blue");
	};
};

const setupWallpaperEngineMediaIntegration = () => {
	albumCoverArt = document.getElementById('album_cover_art');
	trackTitle = document.getElementById('track_title');
	artist = document.getElementById('artist');
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

const paramMapping = {
	alphabet: {
		default: "АБВГДЕЁЖЗИЙКЛМНОавгдеёжзийклмноПРСТУФХЦЧШЩЪЫЬЭЮЯпрстуфхцчшщъыьэюяモエヤキオカ7ケサスz152ヨタワ4ネヌナ98ヒ0ホア3ウ セ¦:\"꞊ミラリ╌ツテニハソ▪—<>0|+*コシマムメ".split(""),
		parse: str => str.split(""),
		update: alphabet => config.alphabet = alphabet,
	},
	fontsize: {
		default: 10,
		parse: parseInt,
		update: fontSize => config.fontSize = fontSize,
	},
	fontsizevariability: {
		default: 3,
		parse: parseInt,
		update: variability => config.fontSizeVariability = variability,
	},
	fgcolour: {
		default: {
			R: 255,
			G: 0,
			B: 0,
		},
		parse: parseColor,
		update: color => {
			if (color.length != 3) {
				console.log("Error we don't have 3 components");
			} else {
				config.foregroundColour.R = color[0];
				config.foregroundColour.G = color[1];
				config.foregroundColour.B = color[2];
			}
			config.invertedForegroundColour = colorInverted(config.foregroundColour);
			removeRainGlareHack();
		},
	},
	bgcolour: {
		default: {
			R: 0,
			G: 0,
			B: 0
		},
		parse: parseColor,
		update: color => {
			if (color.length != 3) {
				console.log("Error we don't have 3 components");
			} else {
				config.backgroundColour.R = color[0];
				config.backgroundColour.G = color[1];
				config.backgroundColour.B = color[2];
			}
			config.invertedBackgroundColour = colorInverted(config.backgroundColour);
			removeRainGlareHack();
		},
	},
	colorspinners: {
		default: false,
		parse: parseBool,
		update: colorSpinners => config.colorSpinners = colorSpinners,
	},
	rainresetchance: {
		default: 0.975,
		parse: parseFloat,
		update: chance => {
			config.rainResetChance = chance;
			_rainResetChance = chance;
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
		update: change => config.audioChangeColour = change,
	},
	audiofadeinrain: {
		default: true,
		parse: parseBool,
		update: fade => config.audioFadeInRain = fade,
	},
	audiofadeinduration: {
		default: 10,
		parse: parseInt,
		update: duration => config.audioFadeInDuration = duration,
	},
};

const config = {
	alphabet: paramMapping.alphabet.default,
	fontSize: paramMapping.fontsize.default,
	fontSizeVariability: paramMapping.fontsizevariability.default,
	animationFrameDuration: paramMapping.animationframeduration.default,
	foregroundColour: paramMapping.fgcolour.default,
	invertedForegroundColour: colorInverted(paramMapping.fgcolour.default),
	backgroundColour: paramMapping.bgcolour.default,
	invertedBackgroundColour: colorInverted(paramMapping.bgcolour.default),
	foregroundTransparency: 0.9,
	backgroundTransparency: 0.15, // 0.04
	colorSpinners: paramMapping.colorspinners.default,
	rainResetChance: paramMapping.rainresetchance.default,
	audioPlaybackState: 2,
	audioFadeInRain: paramMapping.audiofadeinrain.default,	// overrides rain reset chance
	audioFadeInDuration: paramMapping.audiofadeinduration.default,
	audioReactThreshold: paramMapping.audioreactthreshold.default,
	audioReactFreeze: paramMapping.audioreactfreeze.default,
	audioChangeColour: paramMapping.audiochangecolour.default,	// overrides colorSpinners
	albumBoundingBox: { x:0, y:0, width:0, height:0 },
};

const changeColors = (fgColour, bgColour) => {
	config.invertedForegroundColour = colorInverted(config.foregroundColour = fgColour);
	config.invertedBackgroundColour = colorInverted(config.backgroundColour = bgColour);
	updateCanvas(false, false);
	removeRainGlareHack();
};

const getColorStyle = ({R, G, B}, alpha=1, space='rgb') => `${space}(${R}, ${G}, ${B}, ${alpha})`;
const getForegroundStyle = () => getColorStyle(config.foregroundColour, config.foregroundTransparency);
const getInvertedForegroundStyle = () => getColorStyle(config.invertedForegroundColour, config.foregroundTransparency);
const getBackgroundStyle = () => getColorStyle(config.backgroundColour, config.backgroundTransparency);
const getInvertedBackgroundStyle = () => getColorStyle(config.invertedBackgroundColour, config.backgroundTransparency);

const MAX_AUDIO_ARRAY_SIZE = 128;
const MAX_CHANNEL_SIZE = MAX_AUDIO_ARRAY_SIZE/2;

const wallpaperAudioListener = audioArray => {
	const len = matrix.realLength();
	const negativeDirection = config.audioReactFreeze ? 0 : -1;
	for (var i=0; i<len; i++) {
		const drop = matrix.get(i);
		const bucket = Math.floor(drop.x/audioBuckets);
		drop.dx = audioArray[bucket] > config.audioReactThreshold ? negativeDirection : 1;
	}
};

// Media event properties docs: https://docs.wallpaperengine.io/en/web/audio/media.html#available-media-integration-listeners

const wallpaperMediaStatusListener = event => {
	console.log("status", event); // todo remove
};

const wallpaperMediaPropertiesListener = event => {
	console.log("props", event); // todo remove
	trackTitle.textContent = event.title;
	artist.textContent = event.artist;
};

const wallpaperMediaThumbnailListener = event => {
	console.log("thumbnail", event);	// todo remove
	albumCoverArt.src = event.thumbnail;
	config.albumBoundingBox = albumCoverArt.getBoundingClientRect();
	if (config.albumBoundingBox.width === 0) {
		const imageSquareSideSize = 300;
		config.albumBoundingBox.x -= imageSquareSideSize/2;
		config.albumBoundingBox.y -= imageSquareSideSize/2;
		config.albumBoundingBox.width = config.albumBoundingBox.height = imageSquareSideSize;
	}
	document.body.style['background-color'] = event.primaryColor;
	trackTitle.style.color = event.textColor;
	artist.style.color = event.textColor;
	if (config.audioChangeColour)
		changeColors(parseHexColor(event.textColor), parseHexColor(event.primaryColor));
};

const wallpaperMediaPlaybackListener = event => {
	console.log("playback", event);	// todo remove
	config.audioPlaybackState = event.state;
	if (event.state !== window.wallpaperMediaIntegration.PLAYBACK_PLAYING)
		config.rainResetChance = _rainResetChance;
};

const wallpaperMediaTimelineListener = event => {
	console.log("timeline", event);	// todo remove
	if (!config.audioFadeInRain || config.audioPlaybackState !== window.wallpaperMediaIntegration.PLAYBACK_PLAYING)
		return;
	const percentage = event.position / event.duration;
	const isStart = event.position < config.audioFadeInDuration;
	if (isStart || event.position > event.duration - config.audioFadeInDuration)
		config.rainResetChance = parametricGaussian(percentage, 1, isStart ? 0 : 1);
	else
		config.rainResetChance = _rainResetChance;
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
				const v = param.parse(val.value);
				param.update(v);
				console.log("Updating", key, "to", v);
			}
		}
	}
};

const init = () => {
	"use strict";
	canvas = document.getElementById('canvas_matrix');
	ctx = canvas.getContext("2d", { alpha: false });
	updateCanvas(true);
	setupSpinners();
	setupWallpaperEngineMediaIntegration();
	matrix = new Matrix();
	audioBuckets = matrix.length() / MAX_AUDIO_ARRAY_SIZE;
	
	let previousExecution = document.timeline.currentTime;
	const doDraw = timestamp => {
		if (timestamp - previousExecution < config.animationFrameDuration) {
			requestAnimationFrame(doDraw);
			return;
		}
		updateCanvas(false);
		matrix.draw();
		previousExecution = timestamp;
		requestAnimationFrame(doDraw);
	};
	doDraw();
	
	hookWallpaperEngine();
};
