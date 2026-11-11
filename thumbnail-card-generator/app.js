(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { thumb: null, avatar: null, avatarManual: false, lastId: null, timer: null };
  var CARD_W = 620, PAD = 16, MARGIN = 40, R = 18, TR = 12, AV = 44, LH = 31, GAP = 14;
  var FONT = 'Roboto, Arial, sans-serif';

  function ytId(s) {
    var m = (s || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function loadCors(url) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('image failed')); };
      im.src = url;
    });
  }

  function loadFile(file, cb) {
    if (!file || !/^image\//.test(file.type)) return;
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () { cb(im); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function setFetchStatus(msg, isErr) {
    var el = $('fetchStatus');
    el.textContent = msg;
    el.className = 'hint' + (isErr ? ' err' : '');
  }

  // Thumbnail: full-size first, then the smaller 16:9 version (no black bars).
  async function getThumb(id) {
    var urls = [
      'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg',
      'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'
    ];
    for (var i = 0; i < urls.length; i++) {
      try {
        var im = await loadCors(urls[i]);
        if (im.naturalWidth > 120) return im;
      } catch (e) { /* try next */ }
    }
    throw new Error('no thumbnail');
  }

  async function getMeta(id) {
    var url = 'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id);
    var r = await fetch(url);
    if (!r.ok) throw new Error('oembed ' + r.status);
    return r.json();
  }

  // Channel avatar: YouTube doesn't expose it to browsers, so ask unavatar.io using the channel handle.
  async function getAvatar(authorUrl) {
    var part = (authorUrl || '').replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
    if (!part) throw new Error('no handle');
    return loadCors('https://unavatar.io/youtube/' + encodeURIComponent(decodeURIComponent(part)) + '?fallback=false');
  }

  async function autoFill(id) {
    state.lastId = id;
    setFetchStatus('Fetching video details…');
    var results = await Promise.allSettled([getMeta(id), getThumb(id)]);
    if (state.lastId !== id) return; // a newer link replaced this one
    var meta = results[0], th = results[1], problems = [], avatarMissing = false;

    if (meta.status === 'fulfilled') {
      $('title').value = meta.value.title || '';
      $('channel').value = meta.value.author_name || '';
    } else {
      problems.push('title and uploader');
    }
    if (meta.status === 'fulfilled' && !state.avatarManual) {
      try {
        state.avatar = await getAvatar(meta.value.author_url);
        if (state.lastId !== id) return;
        $('avDrop').classList.remove('has');
        $('avText').textContent = 'Channel avatar (optional): click to choose an image';
      } catch (e) {
        if (state.lastId !== id) return;
        state.avatar = null;
        avatarMissing = true;
      }
    }
    if (th.status === 'fulfilled') {
      state.thumb = th.value;
      $('drop').classList.remove('has');
    } else {
      problems.push('thumbnail');
    }

    if (problems.length) {
      setFetchStatus('Couldn’t load the ' + problems.join(' or ') + '. Fill it in by hand below. The video may be private or have embedding turned off.', true);
    } else {
      setFetchStatus(avatarMissing ? 'Done, but the channel avatar didn’t load. You can upload one below.' : 'Done. Edit anything you like.');
    }
    draw();
  }

  function onLink() {
    clearTimeout(state.timer);
    var id = ytId($('link').value);
    if (!id) {
      setFetchStatus($('link').value ? 'That doesn’t look like a YouTube link.' : 'Waiting for a link.', !!$('link').value);
      return;
    }
    state.timer = setTimeout(function () { autoFill(id); }, 250);
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function wrap(c, text, maxW, maxLines) {
    var words = text.trim().split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (c.measureText(t).width <= maxW) cur = t;
      else { if (cur) lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      var last = lines.slice(maxLines - 1).join(' ');
      lines = lines.slice(0, maxLines - 1);
      while (last.length > 1 && c.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines.push(last.trim() + '…');
    }
    return lines.length ? lines : [''];
  }

  var canvas = null;

  function draw() {
    var S = parseFloat($('scale').value) || 2;
    var dark = $('theme').value === 'dark';
    var shadow = $('bgmode').value === 'shadow';
    var m = shadow ? MARGIN : 0;
    var bg = dark ? '#0f0f0f' : '#ffffff', tx = dark ? '#f1f1f1' : '#0f0f0f', sub = dark ? '#aaaaaa' : '#606060';

    var innerW = CARD_W - PAD * 2, thumbH = Math.round(innerW * 9 / 16);
    var maxW = CARD_W - PAD - (PAD + AV + GAP);
    var channel = $('channel').value || '';

    var cv = document.createElement('canvas'), c = cv.getContext('2d');
    c.font = '700 24px ' + FONT;
    var lines = wrap(c, $('title').value || ' ', maxW, 2);
    var headH = Math.max(AV + 4, lines.length * LH + 8 + 22);
    var cardH = PAD + thumbH + 16 + headH + PAD;
    var W = CARD_W + m * 2, H = cardH + m * 2;
    cv.width = Math.round(W * S); cv.height = Math.round(H * S);
    c.scale(S, S);

    // card
    c.save();
    if (shadow) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 28; c.shadowOffsetY = 10; }
    rr(c, m, m, CARD_W, cardH, R); c.fillStyle = bg; c.fill();
    c.restore();
    if (!dark) { rr(c, m + .5, m + .5, CARD_W - 1, cardH - 1, R); c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 1; c.stroke(); }

    // thumbnail
    var tx0 = m + PAD, ty0 = m + PAD, th = state.thumb;
    c.save(); rr(c, tx0, ty0, innerW, thumbH, TR); c.clip();
    if (th) {
      var ir = th.width / th.height, br = innerW / thumbH, sw, sh, sx, sy;
      if (ir > br) { sh = th.height; sw = sh * br; sx = (th.width - sw) / 2; sy = 0; }
      else { sw = th.width; sh = sw / br; sx = 0; sy = (th.height - sh) / 2; }
      c.drawImage(th, sx, sy, sw, sh, tx0, ty0, innerW, thumbH);
    } else {
      c.fillStyle = dark ? '#2a2a2a' : '#d9d9d9'; c.fillRect(tx0, ty0, innerW, thumbH);
      c.fillStyle = '#777'; c.font = '500 20px ' + FONT; c.textAlign = 'center';
      c.fillText('Paste a link to load the thumbnail', tx0 + innerW / 2, ty0 + thumbH / 2 + 7); c.textAlign = 'left';
    }
    c.restore();

    // avatar
    var textTop = ty0 + thumbH + 16, avX = tx0, avY = textTop + 2;
    c.save(); c.beginPath(); c.arc(avX + AV / 2, avY + AV / 2, AV / 2, 0, Math.PI * 2); c.clip();
    if (state.avatar) {
      var a = state.avatar, s = Math.min(a.width, a.height);
      c.drawImage(a, (a.width - s) / 2, (a.height - s) / 2, s, s, avX, avY, AV, AV);
    } else {
      c.fillStyle = dark ? '#3a3a3a' : '#d0d0d0'; c.fillRect(avX, avY, AV, AV);
      c.fillStyle = dark ? '#cfcfcf' : '#555'; c.font = '500 20px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText((channel.trim()[0] || '?').toUpperCase(), avX + AV / 2, avY + AV / 2 + 1);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    c.restore();

    // title + uploader
    var textLeft = tx0 + AV + GAP;
    c.font = '700 24px ' + FONT; c.fillStyle = tx;
    for (var i = 0; i < lines.length; i++) c.fillText(lines[i], textLeft, textTop + 22 + i * LH);
    c.font = '400 18px ' + FONT; c.fillStyle = sub;
    var ch = channel;
    while (ch.length > 1 && c.measureText(ch).width > maxW) ch = ch.slice(0, -2) + '…';
    c.fillText(ch, textLeft, textTop + 22 + lines.length * LH + 2);

    canvas = cv;
    try {
      $('out').src = cv.toDataURL('image/png');
      $('out').width = Math.min(W, 640);
      $('status').textContent = '';
    } catch (e) {
      $('status').textContent = 'The browser blocked that thumbnail. Drop the image in by hand instead.';
      state.thumb = null; draw();
    }
  }

  function slug(s) { return (s || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'video'; }

  $('dlBtn').addEventListener('click', function () {
    if (!canvas) return;
    canvas.toBlob(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'card-' + slug($('title').value) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, 'image/png');
  });

  $('copyBtn').addEventListener('click', function () {
    var st = $('status');
    if (!canvas || !navigator.clipboard || !window.ClipboardItem) { st.textContent = 'Copy isn’t supported here. Use Download PNG.'; return; }
    canvas.toBlob(function (b) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
        .then(function () { st.textContent = 'Copied. Paste it into your editor.'; })
        .catch(function () { st.textContent = 'Copy was blocked. Use Download PNG.'; });
    }, 'image/png');
  });

  // manual thumbnail fallback
  var drop = $('drop'), tf = $('thumbFile');
  function setThumb(f) { loadFile(f, function (im) { state.thumb = im; drop.classList.add('has'); $('dropText').textContent = 'Thumbnail replaced. Drop another to swap it.'; draw(); }); }
  drop.addEventListener('click', function () { tf.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tf.click(); } });
  tf.addEventListener('change', function () { setThumb(tf.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { setThumb(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].type.indexOf('image/') === 0) { setThumb(items[i].getAsFile()); break; }
  });

  // avatar
  var avd = $('avDrop'), af = $('avFile');
  avd.addEventListener('click', function () { af.click(); });
  avd.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); af.click(); } });
  af.addEventListener('change', function () {
    loadFile(af.files[0], function (im) { state.avatar = im; state.avatarManual = true; avd.classList.add('has'); $('avText').textContent = 'Avatar added. Click to replace.'; draw(); });
  });

  $('link').addEventListener('input', onLink);
  $('link').addEventListener('paste', function () { setTimeout(onLink, 0); });
  ['title', 'channel'].forEach(function (id) { $(id).addEventListener('input', draw); });
  ['theme', 'bgmode', 'scale'].forEach(function (id) { $(id).addEventListener('change', draw); });

  draw();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 24px Roboto'), document.fonts.load('400 18px Roboto'), document.fonts.load('500 15px Roboto')]).then(draw, draw);
  }
})();