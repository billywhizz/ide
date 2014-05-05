"use strict";
/*jslint bitwise: true, devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */
var Socket = require("./httpd.node").Socket;
function mimeTypes() {
  return {
    aiff: "audio/x-aiff",
    mp3: "audio/mpeg",
    arj: "application/x-arj-compressed",
    asf: "video/x-ms-asf",
    asx: "video/x-ms-asx",
    au: "audio/ulaw",
    avi: "video/x-msvideo",
    bcpio: "application/x-bcpio",
    ccad: "application/clariscad",
    cod: "application/vnd.rim.cod",
    com: "application/x-msdos-program",
    cpio: "application/x-cpio",
    cpt: "application/mac-compactpro",
    csh: "application/x-csh",
    css: "text/css",
    deb: "application/x-debian-package",
    dl: "video/dl",
    doc: "application/msword",
    drw: "application/drafting",
    dvi: "application/x-dvi",
    dwg: "application/acad",
    dxf: "application/dxf",
    dxr: "application/x-director",
    etx: "text/x-setext",
    ez: "application/andrew-inset",
    fli: "video/x-fli",
    flv: "video/x-flv",
    gif: "image/gif",
    gl: "video/gl",
    gtar: "application/x-gtar",
    gz: "application/x-gzip",
    hdf: "application/x-hdf",
    hqx: "application/mac-binhex40",
    html: "text/html",
    ice: "x-conference/x-cooltalk",
    ico: "image/x-icon",
    ief: "image/ief",
    igs: "model/iges",
    ips: "application/x-ipscript",
    ipx: "application/x-ipix",
    jad: "text/vnd.sun.j2me.app-descriptor",
    jar: "application/java-archive",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    latex: "application/x-latex",
    lsp: "application/x-lisp",
    lzh: "application/octet-stream",
    m: "text/plain",
    m3u: "audio/x-mpegurl",
    man: "application/x-troff-man",
    manifest: "text/cache-manifest",
    me: "application/x-troff-me",
    midi: "audio/midi",
    mif: "application/x-mif",
    mime: "www/mime",
    movie: "video/x-sgi-movie",
    mp4: "video/mp4",
    mpg: "video/mpeg",
    mpga: "audio/mpeg",
    ms: "application/x-troff-ms",
    nc: "application/x-netcdf",
    oda: "application/oda",
    ogm: "application/ogg",
    pbm: "image/x-portable-bitmap",
    pdf: "application/pdf",
    php: "application/octet-stream",
    pgm: "image/x-portable-graymap",
    pgn: "application/x-chess-pgn",
    pgp: "application/pgp",
    pm: "application/x-perl",
    png: "image/png",
    pnm: "image/x-portable-anymap",
    ppm: "image/x-portable-pixmap",
    ppz: "application/vnd.ms-powerpoint",
    pre: "application/x-freelance",
    prt: "application/pro_eng",
    ps: "application/postscript",
    qt: "video/quicktime",
    ra: "audio/x-realaudio",
    rar: "application/x-rar-compressed",
    ras: "image/x-cmu-raster",
    rgb: "image/x-rgb",
    rm: "audio/x-pn-realaudio",
    rpm: "audio/x-pn-realaudio-plugin",
    rtf: "text/rtf",
    rtx: "text/richtext",
    scm: "application/x-lotusscreencam",
    set: "application/set",
    sgml: "text/sgml",
    sh: "application/x-sh",
    shar: "application/x-shar",
    silo: "model/mesh",
    sit: "application/x-stuffit",
    skt: "application/x-koan",
    smil: "application/smil",
    snd: "audio/basic",
    sol: "application/solids",
    spl: "application/x-futuresplash",
    src: "application/x-wais-source",
    stl: "application/SLA",
    stp: "application/STEP",
    sv4cpio: "application/x-sv4cpio",
    sv4crc: "application/x-sv4crc",
    svg: "image/svg+xml",
    swf: "application/x-shockwave-flash",
    tar: "application/x-tar",
    tcl: "application/x-tcl",
    tex: "application/x-tex",
    texinfo: "application/x-texinfo",
    tgz: "application/x-tar-gz",
    tiff: "image/tiff",
    tr: "application/x-troff",
    tsi: "audio/TSP-audio",
    tsp: "application/dsptype",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    log: "text/plain",
    unv: "application/i-deas",
    ustar: "application/x-ustar",
    vcd: "application/x-cdlink",
    vda: "application/vda",
    vivo: "video/vnd.vivo",
    vrm: "x-world/x-vrml",
    wav: "audio/x-wav",
    wax: "audio/x-ms-wax",
    wma: "audio/x-ms-wma",
    wmv: "video/x-ms-wmv",
    wmx: "video/x-ms-wmx",
    wrl: "model/vrml",
    wvx: "video/x-ms-wvx",
    xbm: "image/x-xbitmap",
    xlw: "application/vnd.ms-excel",
    xml: "text/xml",
    xsd: "text/xml",
    xsl: "text/xsl",
    xpm: "image/x-xpixmap",
    xwd: "image/x-xwindowdump",
    xyz: "chemical/x-pdb",
    zip: "application/zip",
    webm: "video/webm",
    woff: "application/x-font-woff"
  };
}
var METHODS = exports.METHODS = {
  DELETE: 0,
  GET: 1,
  HEAD: 2,
  POST: 3,
  PUT: 4,
  /* pathological */
  CONNECT: 5,
  OPTIONS: 6,
  TRACE: 7,
  /* webdav */
  COPY: 8,
  LOCK: 9,
  MKCOL: 10,
  MOVE: 11,
  PROPFIND: 12,
  PROPPATCH: 13,
  SEARCH: 14,
  UNLOCK: 15,
  /* subversion */
  REPORT: 16,
  MKACTIVITY: 17,
  CHECKOUT: 18,
  MERGE: 19,
  /* upnp */
  MSEARCH: 20,
  NOTIFY: 21,
  SUBSCRIBE: 22,
  UNSUBSCRIBE: 23,
  /* RFC-5789 */
  PATCH: 24,
  PURGE: 25
};
var STATUS_CODES = exports.STATUS_CODES = {
  100 : 'CONT', // Continue
  101 : 'SWPR', // Switching Protocols
  102 : 'PROC', // Processing - RFC 2518, obsoleted by RFC 4918
  200 : 'OK  ', // OK
  201 : 'CRET', // Created
  202 : 'ACCP', // Accepted
  203 : 'NAI ', // Non-Authoritative Information
  204 : 'NC  ', // No Content
  205 : 'RC  ', // Reset Content
  206 : 'PC  ', // Partial Content
  207 : 'MS  ', // Multi-Status - RFC 4918
  300 : 'MC  ', // Multiple Choices
  301 : 'MP  ', // Moved Permanently
  302 : 'MT  ', // Moved Temporarily
  303 : 'SO  ', // See Other
  304 : 'NM  ', // Not Modified
  305 : 'UP  ', // Use Proxy
  307 : 'TR  ', // Temporary Redirect
  400 : 'BR  ', // Bad Request
  401 : 'UN  ', // Unauthorized
  402 : 'PR  ', // Payment Required
  403 : 'FORB', // Forbidden
  404 : 'NF  ', // Not Found
  405 : 'MNA ', // Method Not Allowed
  406 : 'NA  ', // Not Acceptabls
  407 : 'PAR ', // Proxy Authentication Required
  408 : 'RTO ', // Request Timeout
  409 : 'CONF', // Conflict
  410 : 'GONE', // Gone
  411 : 'LENR', // Length Required
  412 : 'PREF', // Precondition Failed
  413 : 'RETL', // Request Entity Too Large
  414 : 'RUTL', // Request-URI Too Large
  415 : 'UNMT', // Unsupported Media Type
  416 : 'RRNS', // Requested Range Not Satisfiable
  417 : 'EF  ', // Expectation Failed
  418 : 'TEAP', // I'm a Teapot - RFC 2324
  422 : 'UNEN', // Unprocessable Entity - RFC 4918
  423 : 'LOCK', // Locked - RFC 4918
  424 : 'FALD', // Failed Dependency - RFC 4918
  425 : 'UNOC', // Unordered Collection - RFC 4918
  426 : 'UPGR', // Upgrade Required - RFC 2817
  428 : 'PRER', // Precondition Required - RFC 6585
  429 : 'TOOM', // Too Many Requests - RFC 6585
  431 : 'RHFL', // Request Header Fields Too Large - RFC 6585
  500 : 'ISE ', // Internal Server Error
  501 : 'NI  ', // Not Implemented
  502 : 'BG  ', // Bad Gateway
  503 : 'SU  ', // Service Unavailable
  504 : 'GWTO', // Gateway Timeout
  505 : 'VERS', // HTTP Version Not Supported
  506 : 'VARN', // Variant also Negotiates - RFC 2295
  507 : 'STOR', // Insufficient Storage - RFC 4918
  509 : 'BAND', // Bandwidth Limit Exceeded
  510 : 'NOTX', // Not Extended - RFC 2774
  511 : 'AUTH'  // Network Authentication Required - RFC 6585
};
var MaskKeys = new function(size) {
  var keys = [];
  var k;
  //TODO: need to make this random
  while(size--) {
    k = Math.floor((Math.random()*(Math.pow(2,32)))+1);
    keys.push([(k>>24)&0xff,(k>>16)&0xff,(k>>8)&0xff,k&0xff]);
  }
  this.next = function() {
    var key = keys.shift();
    keys.push(key);
    return key;
  }
}(1000);
function maskBuffer(b, k, start, len) {
  var ki = 0;
  var bi = start;
  while(len--) {
    b[bi] = b[bi] ^ k[ki++];
    if(ki === 4) ki = 0;
    bi++;
  }
}
function buildDefaultIndex(b) {
  // todo - allow user to provide templates/pages for these - maybe just expose 
  // the buffers/index and allow user to rebuild it?
  var codes = {};
  var off = 0;
  Object.keys(STATUS_CODES).forEach(function(k) {
    var s = "HTTP/1.1 " + 
      k + 
      " " + 
      STATUS_CODES[k] + 
      "\r\nDate: Wed, 16 Apr 2014 05:36:05 GMT\r\nContent-Length: 0\r\nConnection: Keep-Alive\r\n\r\n";
    b.asciiWrite(s, off, s.length);
    codes["r" + k] = {
      off: off,
      len: s.length
    };
    off += s.length;
  });
  b._start = off;
  return codes;
}
function Request(peer) {
  this.major = 0;
  this.minor = 0;
  this.method = 0;
  this.upgrade = 0;
  this.keepalive = 0;
  this.url = "";
  this.idx = 0
  this.peer = peer;
};
function Message(peer) {
  this.fin = 0;
  this.opcode = 0;
  this.length = 0;
  this.body = null;
  this.peer = peer;
};
function Server(cfg) {
  var _s = this;
  var server;
  var b;
  var nheaders;
  var len;
  var off;
  _s.onConnect = function() {};
  var index;
  var peers = {};
  var key, val;
  cfg = cfg || {};
  cfg.host = cfg.host || "127.0.0.1";
  cfg.type = cfg.type || "tcp";
  cfg.port = cfg.port || "8080";
  this.config = cfg;
  this.mime = mimeTypes();
  cfg.maxHeaders = parseInt(cfg.maxHeaders || "20");
  var bout;
  var curtime = new Buffer(29);
  curtime.asciiWrite(new Date().toUTCString());
  setInterval(function() {
    curtime.asciiWrite(new Date().toUTCString());
  }, 1000);
  var _headers = [];
  off = cfg.maxHeaders;
  while(off--) {
    _headers.push(["",""]);
  }
  var BLOB = 2;
  var TEXT = 1;
  function onConnect(fd) {
    var peer = peers[fd] = {
      fd: fd,
      remoteAddress: server.getPeerName(fd),
      onHeaders: function() {},
      onComplete: function() {},
      onClose: function() {},
      onStart: function() {},
      onRequest: function() {},
      onBody: function() {},
      onError: function() {},
      onWrite: function() {},
      onMessage: function() {},
      setNoDelay: function(on) {
        return server.setNoDelay(fd, on);
      },
      writeResponse: function(start, len) {
        return server.writeTime(fd, start, len);
      },
      send: function(m) {
        var masking = this.mask;
        var OpCode = 0x81;
        if(this.binaryType === BLOB) {
          OpCode = 0x82;
        }
        var dataLength = m.length;
        var startOffset = 2;
        var secondByte = dataLength;
        var i = 0;
        var key;
        if (dataLength > 65536) {
          startOffset = 10;
          secondByte = 127;
        }
        else if (dataLength > 125) {
          startOffset = 4;
          secondByte = 126;
        }
        var len;
        len = dataLength + startOffset;
        if(masking) {
          len += 4;
        }
        var start = bout._start;
        bout[start] = OpCode;
        bout[start + 1] = secondByte | (masking << 7);
        switch (secondByte) {
          case 126:
            bout[start + 2] = dataLength >>> 8;
            bout[start + 3] = dataLength % 256;
            break;
          case 127:
            var l = dataLength;
            for (i = 1; i <= 8; ++i) {
              if(masking) {
                bout[start + startOffset + 4 - i] = l & 0xff;
              }
              else {
                bout[start + startOffset - i] = l & 0xff;
              }
              l >>>= 8;
            }
            break;
        }
        if(masking) {
          key = MaskKeys.next();
          bout[start + startOffset++] = key[0];
          bout[start + startOffset++] = key[1];
          bout[start + startOffset++] = key[2];
          bout[start + startOffset++] = key[3];
        }
        if(this.binaryType === BLOB) {
          if(masking) maskBuffer(m, key, m.length);
          m.copy(bout, start + startOffset, 0, dataLength);
        }
        else {
          bout.utf8Write(m, start + startOffset);
          if(masking) maskBuffer(bout, key, start + startOffser, m.length);
        }
        return server.writeCopy(fd, bout._start, len);
      },
      close: function() {
        return server.close(fd);
      },
      //TODO: look at this - needs further checks
      pause: function() {
        peer.paused = (server.pause(fd) === 0);
        return peer.paused;
      },
      resume: function() {
        peer.paused = (server.resume(fd) === 0);
        return !peer.paused;
      },
      upgrade: function() {
        return server.upgrade(fd);
      }
    };
    _s.onConnect(peer);
  }
  function onHeaders(fd) {
    var peer = peers[fd];
    var request = peer.request;
    request.major = b[0];
    request.minor = b[1];
    nheaders = b[2];
    request.method = b[3];
    request.upgrade = b[4];
    request.keepalive = b[5];
    len = (((b[8]<<24)>>>0) + (b[9]<<16) + (b[10]<<8) + (b[11]));
    off = 12;
    request.url = server.slice(off, len);
    off += len;
    var idx = 0;
    while(nheaders--) {
      len = (b[off] << 8) + b[off + 1];
      off += 2;
      _headers[idx][0] = server.slice(off, len);
      off += len;
      len = (b[off] << 8) + b[off + 1];
      off += 2;
      _headers[idx++][1] = server.slice(off, len);
      off += len;
    }
    request.headers = _headers.slice(0,idx);
    peer.onHeaders();
  }
  function onRequest(fd) {
    var peer = peers[fd];
    peer._index = 0;
    peer.onComplete();
  }
  function onClose(fd) {
    var peer = peers[fd];
    peer.closed = true;
    peer.onClose();
  }
  function onMessage(fd) {
    var peer = peers[fd];
    peer.request = new Request(peer);
    peer.onRequest();
  }
  function onBody(fd, len) {
    peers[fd].onBody(b.slice(0, len));
  }
  function onWrite(fd, index, status) {
    peers[fd].onWrite(index, status);
  }
  function onError(fd, e) {
    peers[fd].onError(e);
  }
  function onStart(fd) {
    var peer = peers[fd];
    peer.binaryType = TEXT;
    peer.onStart();
    peer.mask = false;
  }
  function onHeader(fd) {
    var peer = peers[fd];
    var message = peer.message = new Message(peer);
    message.fin = b[0];
    message.opcode = b[4];
    message.length = (((b[6]<<24)>>>0) + (b[7]<<16) + (b[8]<<8) + (b[9]));
    message.body = [];
  }
  function onChunk(fd, len) {
    var peer = peers[fd];
    var message = peer.message;
    if(message.opcode === 2) {
      var bb = new Buffer(len);
      b.copy(bb, 0, 0, len);
      message.body.push(bb);
    }
    else {
      message.body.push(b.utf8Slice(0, len));
    }
  }
  function onComplete(fd) {
    var peer = peers[fd];
    var message = peer.message;
    if(message.opcode === 1) {
      message.body = message.body.join("");
    }
    peer.onMessage();
  }
  server = new Socket(cfg.type==="tcp"?0:1);
  server.onHeaders = onHeaders;
  server.onRequest = onRequest;
  server.onConnect = onConnect;
  server.onClose = onClose;
  server.onMessage = onMessage;
  server.onBody = onBody;
  server.onWrite = onWrite;
  server.onError = onError;
  
  server.onStart = onStart;
  server.onHeader = onHeader;
  server.onChunk = onChunk;
  server.onComplete = onComplete;
  
  server.setCallbacks();
  server.in = b = new Buffer(64 * 1024);
  server.time = curtime;
  server.out = bout = new Buffer(512 * 1024 * 1024);
  index = buildDefaultIndex(server.out);
  _s.index = index;
  _s.out = server.out;
  this.listen = function(port, cb) {
    port = port || cfg.port;
    var r = server.listen((cfg.type==="tcp"?cfg.host:port), port);
    if(cb) {
      process.nextTick(function() {
        cb(r);
      });
    }
    return _s;
  };
  this.server = server;
  this.stack = [];
  this.use = function(cfg, plugin) {
    if(!cfg) cfg = {};
    cfg.app = _s;
    _s.stack.push(plugin(cfg));
    if(_s.stack.length > 1) {
      _s.stack[_s.stack.length - 2].next = _s.stack[_s.stack.length-1];
    }
    return _s;
  };
  this.start = function(ctx) {
    _s.stack[0].run(ctx);
  };
  this.connect = function(onConnect) {
    if(onConnect) {
      _s.onConnect = onConnect;
    }
    else {
      _s.onConnect = function(p) {
        var app = this;
        p.onComplete = function() {
          app.start(this);
        }
      };
    }
    return _s;
  };
}
exports.createServer = function(cfg) {
  return new Server(cfg);
};