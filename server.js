var stack = require("./lib/stack");
var httpd = require("./lib/httpd");
var FileCache = require("./lib/filecache").FileCache;
var pty = require("pty.js");
var fs = process.binding("fs");
var constants = process.binding("constants");
function writeAll(fd, buffer, offset, length, position, callback) {
  fs.write(fd, buffer, offset, length, position, function(e, written) {
    if (e) {
      fs.close(fd, function() {
        if (callback) callback(e);
      });
    } else {
      if (written === length) {
        fs.close(fd, callback);
      } else {
        offset += written;
        length -= written;
        position += written;
        writeAll(fd, buffer, offset, length, position, callback);
      }
    }
  });
}
fs.writeFile = function(path, data, encoding_, callback) {
  var encoding = (typeof(encoding_) == 'string' ? encoding_ : 'utf8');
  fs.open(path, constants.O_TRUNC | constants.O_CREAT | constants.O_RDWR, parseInt(438,8), function(e, fd) {
    if (e) {
      if (callback) callback(e);
    } else {
      var buffer = Buffer.isBuffer(data) ? data : new Buffer('' + data,
          encoding);
      if(buffer.length <= 0) {
        return fs.close(fd, callback);
      }
      writeAll(fd, buffer, 0, buffer.length, 0, callback);
    }
  });
};
var cfg = {
  host: "0.0.0.0",
  port: 8081,
  path: "./public",
  maxFileSize: 1 * 1024 * 1024
};
var config = {
  shell: "bash",
  args: null,
  port: 8001,
  term: "xterm-256color",
  cols: 80,
  rows: 50
};
var services = {
  oneflow: {
    onStart: function() {
      var peer = this;
      peer.setNoDelay(true);
      peer.binaryType = 2;
      peer.term = pty.spawn(config.shell || "bash", config.args, {
        name: config.term || "xterm",
        cols: config.cols || 80,
        rows: config.rows || 24,
        cwd: process.env.HOME,
        env: process.env
      });
      peer.term.peer = peer;
      peer.term.on("data", function(data) {
        peer.send(data);
      });
      peer.term.on("close", function() {
        console.error("terminal.close");
      });
    },
    onClose: function() {
      console.error("service.close");
    },
    onError: function(e) {
      console.error(e);
    },
    onMessage: function() {
      var b = this.message.body;
      var m;
      if(b[0] === "{" && b[1] === "\"") {
        m = JSON.parse(b.toString());
        return this.term.resize(m.cols, m.rows);
      }
      this.term.write(this.message.body);
    }
  }
};
var cache;
function onConnect(peer) {
  peer.onRequest = onRequest;
  peer.onHeaders = onHeaders;
  peer.onComplete = onComplete;
  peer.onBody = onBody;
  peer.onClose = onClose;
  peer.onWrite = onWrite;
}
function onClose() {
}
function onWrite(index, status) {
  if(status !== 0) this.close();
}
function onRequest() {
}
function onHeaders() {
  var req = this.request;
  var peer = this;
  var _headers = {};
  req.headers.forEach(function(header) {
    _headers[header[0].toLowerCase()] = header[1];
  });
  req.headers = _headers;
  switch(req.method) {
    case httpd.METHODS.HEAD:
    case httpd.METHODS.GET:
      break;
    case httpd.METHODS.PUT:
      if(req.headers["content-length"]) {
        req.body = new Buffer(parseInt(req.headers["content-length"]));
      }
      else {
        req.body = new Buffer(cfg.maxFileSize);
      }
      req.body._off = 0;
      break;
    case httpd.METHODS.POST:
      break;
    case httpd.METHODS.DELETE:
      break;
    case httpd.METHODS.OPTIONS:
      break;
    case httpd.METHODS.PATCH:
      break;
    case httpd.METHODS.PURGE:
      break;
  }
}
function onBody(b) {
  var req = this.request;
  b.copy(req.body, req.body._off);
  req.body._off += b.length;
}
function onComplete() {
  var req = this.request;
  if(req.complete) return;
  var peer = this;
  var url = req.url;
  var r404 = app.index.r404;
  var r200 = app.index.r200;
  var r201 = app.index.r201;
  switch(req.method) {
    case httpd.METHODS.HEAD:
    case httpd.METHODS.GET:
      if(req.upgrade) {
        service = services[req.headers["sec-websocket-protocol"]];
        if(!service) {
          return peer.writeResponse(r404.off, r404.len);
        }
        peer.onError = service.onError;
        peer.onClose = service.onClose;
        peer.onStart = service.onStart;
        peer.onMessage = service.onMessage;
        return this.upgrade();
      }
      if(url[url.length-1] === "/") {
        break;
      }
      function fileHandler(e, file) {
        if(e) {
          peer.writeResponse(r404.off, r404.len);
          return;
        }
        if(req.method === httpd.METHODS.GET) {
          peer.writeResponse(file.start, file.length);
        }
        else {
          peer.writeResponse(file.start, file.headers.length);
        }
      }
      cache.serve(req, app.out, fileHandler);
      req.complete = true;
      break;
    case httpd.METHODS.POST:
    case httpd.METHODS.PUT:
      fs.writeFile(cfg.path + req.url, req.body, null, function(e) {
        if(e) {
          console.error(e);
          return app.start(peer);
        }
        peer.writeResponse(r201.off, r201.len);
      });
      req.complete = true;
      break;
    case httpd.METHODS.DELETE:
      fs.unlink(cfg.path + req.url, function(e) {
        if(e) {
          if(e.code ===  "EISDIR") {
            fs.rmdir(cfg.path + req.url, function(e) {
              if(e) {
                console.error(e);
                return app.start(peer)
              }
              peer.writeResponse(r200.off, r200.len);
            });
            return ;
          }
          console.error(e);
          return app.start(peer)
        }
        peer.writeResponse(r200.off, r200.len);
      });
      req.complete = true;
      break;
    case httpd.METHODS.MKCOL:
      fs.mkdir(cfg.path + req.url, 0755, function(e) {
        if(e) {
          console.error(e);
          return app.start(peer)
        }
        peer.writeResponse(r201.off, r201.len);
      });
      req.complete = true;
      break;
    case httpd.METHODS.OPTIONS:
      break;
    case httpd.METHODS.PATCH:
      break;
    case httpd.METHODS.PURGE:
      break;
  }
  if(!req.complete) app.start(this);
}
var app = httpd.createServer(cfg)
  .connect(onConnect)
  .use(cfg, stack.index)
  .use(cfg, stack.notFound)
  .listen(cfg.port);
cfg.app = app;
cache = new FileCache(cfg.path, app.mime);