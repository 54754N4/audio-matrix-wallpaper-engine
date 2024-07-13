document.getElementById('generateButton').addEventListener('click', () => {
    const fileInput = document.getElementById('fileInput');
    const gradientLength = parseInt(document.getElementById('gradientLength').value, 10);
    const output = document.getElementById('output');

    if (fileInput.files.length === 0) {
        alert('Please select a JSON file.');
        return;
    }

    if (isNaN(gradientLength) || gradientLength <= 0) {
        alert('Please enter a valid gradient length.');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(event) {
        try {
            const characters = JSON.parse(event.target.result);

            // Filter out non-printable characters
            const printableCharacters = characters.filter(charObj => {
                const codePoint = charObj.char[0];
                // Check Unicode general categories for printable characters
                const char = String.fromCodePoint(codePoint);
                return isCharacterPrintable(char, codePoint);
            });

            // Sort characters by density
            const sortedCharacters = printableCharacters.sort((a, b) => a.density - b.density);
            console.log(sortedCharacters);

            // Create gradient
            const startMax = 20;
            const start = Math.floor(Math.random() * startMax);
            const step = sortedCharacters.length / gradientLength;
            const gradient = [];
            const usedCharacters = new Set();

            for (let i = 0; i < gradientLength; ++i) {
                let index = start + Math.floor(i * step);
                while (index < sortedCharacters.length && usedCharacters.has(String.fromCodePoint(...sortedCharacters[index].char))) {
                    index++;
                }
                if (index < sortedCharacters.length) {
                    const char = String.fromCodePoint(...sortedCharacters[index].char);
                    gradient.push(sortedCharacters[index].char);
                    usedCharacters.add(char);
                }
            }

            console.log("gradient", gradient);
            console.log("chars", usedCharacters);
            output.innerText = gradient.map(codepoints => String.fromCodePoint(...codepoints)).join('');
            
        } catch (error) {
            alert('Error parsing JSON file: ' + error.message);
        }
    };

    reader.onerror = function() {
        alert('Error reading file');
    };

    reader.readAsText(file);
});

/**
 * Parses stupid unicode tables in wikipedia cause fuck I'm not doing it by hand.
 * 
 * @param {*} table of compact unicode block of characters on wikipedia
 * @returns Ranges of non-reserved characters
 */
const parseUnicodeBlockTable = table => {
    const title = table.rows[0].children[0].children[0].innerText;
    const start = parseInt(`0x${table.rows[2].children[0].innerText.substr(2, table.rows[2].children[0].innerText.length - 2 - 1)}0`, 16); // converts "U+0A0x" to "0A0"
    const reserved = [];
    for (let row=2; row < table.rows.length - 1; ++row) {   // cause first row is title, second is hex digits & last row is notes
        for (let col=1; col < table.rows[row].children.length; ++col) { // cause first col is start in hex
            if (table.rows[row].children[col].title === 'Reserved') {
                let offset = (row-2) * 16 + (col-1);
                reserved.push(offset);
            }
        }
    }
    const formatRange = (s, e) => [(start + s).toString(16).toUpperCase(), (start + e).toString(16).toUpperCase()];
    const elements = (table.rows.length - 3) * (table.rows[2].children.length - 1);
    if (reserved.length == 0) {
        return {
            title,
            ranges: [formatRange(0, elements - 1)]  // include all range
        };
    }
    const ranges = [];
    let i = 0, reserveStart = reserved[0];
    if (reserveStart == 0) {    // no start block
        while (reserved.includes(i+1)) // find next contiguous non reserved
            ++i;
        reserveStart = i;
    } else
        ranges.push(formatRange(0, reserveStart - 1));
    for (; i<elements; ++i) {
        if (!reserved.includes(i))  // wait till next border
            continue;
        if (i-1 >= reserveStart+1)
            ranges.push(formatRange(reserveStart+1, i-1));
        while (reserved.includes(i+1))  // expand while contiguous
            ++i;
        reserveStart = i;
    }
    const reserveLast = reserved[reserved.length - 1];
    if (reserveLast != elements - 1)
        ranges.push(formatRange(reserveLast+1, elements - 1));
    return {
        title,
        ranges
    };
};

const convertToCode = ({title, ranges}) => {
    let out = `\nrange("${title}", [`;
    if (ranges.length == 1) 
        out += `${ranges.map(range => `[0x${range[0]}, 0x${range[1]}]`)}`;
    else 
        out += '\n' + ranges.map(range => `\t[0x${range[0]}, 0x${range[1]}]`).join(",\n") + "\n"; 
    out += "]),\n";
    return out;
};

// https://en.wikipedia.org/wiki/Unicode_block#List_of_blocks
// For awkward tables just do : convertToCode(parseUnicodeBlockTable(temp0));

const range = (name, range) => ({name, range});

function isCharacterPrintable(char, codePoint) {
    // Define a regex that matches printable characters using Unicode property escapes
    const printableRegex = /^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Z}]$/u;
    // Check if the character matches the printable regex
    const matchesPrintableRegex = printableRegex.test(char);

    // Exclude control characters, private use, surrogate pairs, and non-character code points
    const isNonPrintable = (
        (codePoint >= 0x00 && codePoint <= 0x1F) || // Control characters
        (codePoint >= 0x7F && codePoint <= 0x9F) || // Control characters
        (codePoint >= 0x2B0 && codePoint <= 0x2FF) || // Spacing Modifier Letters
        (codePoint >= 0xD800 && codePoint <= 0xDFFF) || // Surrogate pairs
        (codePoint >= 0xFDD0 && codePoint <= 0xFDEF) || // Non-characters
        ((codePoint & 0xFFFF) === 0xFFFF) || ((codePoint & 0xFFFF) === 0xFFFE) || // Non-characters
        (codePoint >= 0xE000 && codePoint <= 0xF8FF) || // Private Use Area
        (codePoint >= 0xF0000 && codePoint <= 0xFFFFD) || // Supplementary Private Use Area A
        (codePoint >= 0x100000 && codePoint <= 0x10FFFD) || // Supplementary Private Use Area B
        (codePoint >= 0x2060 && codePoint <= 0x206F) || // Format characters
        (codePoint >= 0xFFF0 && codePoint <= 0xFFFF) || // Specials
        (codePoint >= 0x1BCA0 && codePoint <= 0x1BCAF) || // Shorthand Format Controls
        (codePoint >= 0x1D173 && codePoint <= 0x1D17A) || // Musical notation control characters
        (codePoint >= 0x034F && codePoint <= 0x035F) || // Combining Grapheme Joiner and other non-printable marks
        (codePoint >= 0x0600 && codePoint <= 0x0605) || // Arabic non-printable characters
        (codePoint >= 0xFFF9 && codePoint <= 0xFFFB) || // Interlinear annotation characters
        (codePoint >= 0x110BD && codePoint <= 0x110BD) || // Kaithi number sign
        (codePoint >= 0x1FFFE && codePoint <= 0x10FFFF) // Non-characters and other ranges
    );

    return matchesPrintableRegex && !isNonPrintable;
}
