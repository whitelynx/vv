const [body] = document.getElementsByTagName('body');
const cursorEl = document.getElementById('cursor');
const screenEl = document.getElementById('screen');
const canvasEl = document.getElementById('canvas');
const context = canvasEl.getContext('2d', { alpha: false });
let cursor = [0, 0];
let cols;
let rows;
let hiFgColor;
let hiBgColor;
let hiSpColor;
let hiItalic;
let hiBold;
let hiUnderline;
let hiUndercurl;
let defaultFgColor;
let defaultBgColor;
let defaultSpColor;
let reverseColor;
let scrollRect = new Array(4);

const colorsCache = {};
const charsCache = {};

// Math.floor to avoid sub-pixel draw
const targetCharWidth = Math.floor(7.2);
const targetCharHeight = Math.floor(15);
const targetFontSize = 12;
const fontFamily = 'SFMono-Light';
const scale = 2;
const charWidth = targetCharWidth * scale;
const charHeight = targetCharHeight * scale;
const fontSize = targetFontSize * scale;

const fgColor = () =>
  (reverseColor ? hiBgColor || defaultBgColor : hiFgColor || defaultFgColor);

const bgColor = () =>
  (reverseColor ? hiFgColor || defaultFgColor : hiBgColor || defaultBgColor);

const spColor = () =>
  (reverseColor ? hiSpColor || defaultSpColor : hiSpColor || defaultSpColor);

const font = () =>
  [
    hiItalic ? 'italic' : '',
    hiBold ? 'bold' : '',
    `${fontSize}px`,
    fontFamily,
  ].join(' ');

const getCharBitmap = (char) => {
  const key = [
    char,
    fgColor(),
    bgColor(),
    spColor(),
    hiItalic,
    hiBold,
    hiUnderline,
    hiUndercurl,
  ].join('-');
  if (!charsCache[key]) {
    const c = document.createElement('canvas');
    c.width = charWidth;
    c.height = charHeight;
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = bgColor();
    ctx.fillRect(0, 0, charWidth, charHeight);
    ctx.fillStyle = fgColor();
    ctx.font = font();
    ctx.textBaseline = 'top';
    ctx.fillText(char, 0, 0);

    if (hiUnderline) {
      ctx.strokeStyle = fgColor();
      ctx.lineWidth = scale;
      ctx.beginPath();
      ctx.moveTo(0, charHeight - scale);
      ctx.lineTo(charWidth, charHeight - scale);
      ctx.stroke();
    }

    if (hiUndercurl) {
      ctx.strokeStyle = spColor();
      ctx.lineWidth = scale;
      const x = charWidth;
      const y = charHeight - scale / 2;
      const h = charWidth / 2; // Height of the wave
      ctx.beginPath();
      ctx.moveTo(0, y - h / 2);
      ctx.bezierCurveTo(x / 4, y - h / 2, x / 4, y, x / 2, y);
      ctx.bezierCurveTo(x / 4 * 3, y, x / 4 * 3, y - h / 2, x, y - h / 2);
      ctx.stroke();
    }

    charsCache[key] = c;
  }
  return charsCache[key];
};

const printChar = (i, j, char) => {
  context.drawImage(getCharBitmap(char), j * charWidth, i * charHeight);
};

const getColorString = (rgb) => {
  if (!rgb) {
    return null;
  }
  if (!colorsCache[rgb]) {
    const bgr = [];
    for (let i = 0; i < 3; i += 1) {
      bgr.push(rgb & 0xff); // eslint-disable-line no-bitwise
      rgb >>= 8; // eslint-disable-line no-param-reassign, no-bitwise
    }
    colorsCache[rgb] = `rgb(${bgr[2]},${bgr[1]},${bgr[0]})`;
  }
  return colorsCache[rgb];
};

// https://github.com/neovim/neovim/blob/master/runtime/doc/ui.txt
const redrawCmd = {
  put: (props) => {
    for (let i = 0; i < props.length; i += 1) {
      printChar(cursor[0], cursor[1], props[i][0]);
      cursor[1] += 1;
    }
  },

  cursor_goto: ([newCursor]) => {
    cursor = newCursor;
    const left = Math.floor(cursor[1] * targetCharWidth - 1);
    const top = cursor[0] * 15 - 1;
    cursorEl.style.transform = `translate(${left}px, ${top}px)`;
  },

  clear: () => {
    cursor = [0, 0];
    context.fillStyle = defaultBgColor;
    context.fillRect(0, 0, canvasEl.width, canvasEl.height);
  },

  eol_clear: () => {
    const left = cursor[1] * charWidth;
    const top = cursor[0] * charHeight;
    const width = canvasEl.width - left;
    const height = charHeight;
    context.fillRect(left, top, width, height);
  },

  highlight_set: (props) => {
    for (let i = 0; i < props.length; i += 1) {
      const [
        {
          foreground,
          background,
          special,
          reverse,
          italic,
          bold,
          underline,
          undercurl,
        },
      ] = props[i];
      reverseColor = reverse;
      hiFgColor = getColorString(foreground);
      hiBgColor = getColorString(background);
      hiSpColor = getColorString(special);
      hiItalic = italic;
      hiBold = bold;
      hiUnderline = underline;
      hiUndercurl = undercurl;
    }
  },

  update_bg: ([color]) => {
    defaultBgColor = getColorString(color);
    body.style.background = defaultBgColor;
  },

  update_fg: ([color]) => {
    defaultFgColor = getColorString(color);
  },

  update_sp: ([color]) => {
    defaultSpColor = getColorString(color);
  },

  set_scroll_region: ([rect]) => {
    // top, bottom, left, right
    scrollRect = rect;
  },

  // https://github.com/neovim/neovim/blob/master/runtime/doc/ui.txt#L202
  scroll: ([[scrollCount]]) => {
    const [top, bottom, left, right] = scrollRect;

    const x = left * charWidth; // region left
    let y; // region top
    const w = (right - left + 1) * charWidth; // clipped part width
    const h = (bottom - top + 1 - Math.abs(scrollCount)) * charHeight; // clipped part height
    const X = x; // destination left
    let Y; // destination top
    const cx = x; // clear left
    let cy; // clear top
    const cw = w; // clear width
    const ch = Math.abs(scrollCount) * charHeight; // clear height
    if (scrollCount > 0) {
      // scroll up.
      y = (top + scrollCount) * charHeight;
      Y = top * charHeight;
      cy = (bottom + 1 - scrollCount) * charHeight;
    } else {
      // scroll down
      y = top * charHeight;
      Y = (top - scrollCount) * charHeight;
      cy = top * charHeight;
    }

    // Copy scrolled lines
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    context.drawImage(canvasEl, x, y, w, h, X, Y, w, h);

    // Clear lines under scroll
    context.fillStyle = defaultBgColor;
    context.fillRect(cx, cy, cw, ch);
  },

  resize: (props) => {
    [[cols, rows]] = props;
    screenEl.style.width = `${cols * targetCharWidth}px`;
    screenEl.style.height = `${rows * targetCharHeight}px`;
    canvasEl.width = cols * charWidth;
    canvasEl.height = rows * charHeight;
    context.fillStyle = bgColor();
    context.fillRect(0, 0, canvasEl.width, canvasEl.height);
  },
};

export default redrawCmd;
