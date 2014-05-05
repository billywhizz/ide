"use strict";
/*jslint bitwise: true, devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */
var FileCache = require("./filecache").FileCache;
var httpd = require("./httpd");
var fs = process.binding("fs");
var os = process.binding("os");
var constants = process.binding("constants");
var METHODS = httpd.METHODS;
/*
TODO:
- server level plugins
- host level plugins
- vhost level plugins
- app level plugins (don't go too far with this!)
*/
function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}
function Job(cfg) {
  this.next = null;
}
Job.prototype.run = function(peer) {};
function WebSocket(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  this.config = cfg;
  this.r404 = cfg.app.index.r404;
}
inherits(Job, WebSocket);
WebSocket.prototype.run = function(peer) {
  if(peer.request.upgrade) {
    peer.onError = this.config.onError;
    peer.onClose = this.config.onClose;
    peer.onStart = this.config.onStart;
    peer.onMessage = this.config.onMessage;
    return peer.upgrade();
  }
  this.next.run(peer);
};
function NotFound(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  this.r404 = cfg.app.index.r404;
}
inherits(Job, NotFound);
NotFound.prototype.run = function(peer) {
  peer.writeResponse(this.r404.off, this.r404.len);
};
function Null(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  this.next = null;
}
inherits(Job, Null);
Null.prototype.run = function(peer) {
  this.next.run(peer);
};
function Trace(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  cfg.events = cfg.events || [
    "onStart", 
    "onHeaders", 
    "onBody", 
    "onComplete", 
    "onClose", 
    "onError", 
    "onWrite"
  ];
  cfg.app.connect(function(peer) {
    console.log(process.stderr, "onConnect (" + peer.fd + ")");
    console.dir(process.stderr, arguments);
    cfg.events.forEach(function(k) {
      peer[k] = function() {
        console.log(process.stderr, k + " (" + peer.fd + ")");
        console.dir(process.stderr, arguments);
        console.dir(peer.request);
      };
    });
  });
}
inherits(Job, Trace);
Trace.prototype.run = function(peer) {
  this.next.run(peer);
}
function Logger(cfg) {
  cfg = cfg || {};
  this.config = cfg;
  cfg.inspect = cfg.inspect || console.dir;
  cfg.loglevel = cfg.loglevel || trace;
  Job.call(this, cfg);
}
inherits(Job, Logger);
Logger.prototype.run = function(peer) {
  var req = peer.request;
  this.config.inspect({
    time: Date.now(),
    host: req.host,
    method: req.method,
    url: req.url,
    remoteAddress: peer.remoteAddress,
    major: req.major,
    minor: req.minor,
    upgrade: req.upgrade,
    keepalive: req.keepalive
  });
  this.next.run(peer);
};
function Vhost(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  if(!cfg.hosts) {
    cfg.hosts = {};
    cfg.hosts[cfg.app.config.host] = {};
    cfg.hosts[cfg.app.config.host + ":" + cfg.app.config.port] = {};
    cfg.hosts[os.getHostname()] = {};
    cfg.hosts[os.getHostname() + ":" + cfg.app.config.port] = {};
    if(cfg.app.config.host === "0.0.0.0") {
      cfg.hosts["127.0.0.1"] = {};
      cfg.hosts["127.0.0.1:" + cfg.app.config.port] = {};
    }
  }
  this.config = cfg;
  this.r404 = cfg.app.index.r404;
}
inherits(Job, Vhost);
Vhost.prototype.run = function(peer) {
  var req = peer.request;
  var host = this.config.hosts[req.host];
  if(!host) {
    return peer.writeResponse(this.r404.off, this.r404.len);
  }
  this.next.run(peer);
};
function Resty(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  this.config = cfg;
  var api = {};
  Object.keys(cfg.api).forEach(function(k) {
    api["M" + METHODS[k.toUpperCase()]] = cfg.api[k];
  });
  this.api = api;
}
inherits(Job, Resty);
Resty.prototype.run = function(peer) {
  var req = peer.request;
  var cfg = this.config;
  if(!req.url.match(cfg.match)) {
    return this.next.run(peer);
  }
  var fun = this.api["M" + req.method];
  if(!fun) {
    return this.next.run(peer);
  }
  fun(peer);
};
function Static(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  cfg.path = cfg.path || "./static";
  this.config = cfg;
  this.cache = new FileCache(cfg.path, cfg.app.mime);
  this.out = cfg.app.out;
}
inherits(Job, Static);
Static.prototype.run = function(peer) {
  var req = peer.request;
  var st = this;
  if((req.method !== METHODS.GET)) {
    return this.next.run(peer);
  }
  function fileHandler(err, file) {
    if(err) {
      return st.next.run(peer);
    }
    peer.writeResponse(file.start, file.length);
  }
  this.cache.serve(req, this.out, fileHandler);
};
function Index(cfg) {
  cfg = cfg || {};
  Job.call(this, cfg);
  cfg.path = cfg.path || "./static";
  var _idx = this;
  var urlcache = {};
  var indexcache = {};
  var out = cfg.app.out;
  var isorx = /(\d\d\d\d-\d\d-\d\d)T(\d\d:\d\d:\d\d)\.\d\d\dZ/g;
  // Split a filename into [root, dir, basename, ext], unix version
  // 'root' is just a slash, or nothing.
  var splitPathRe = 
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
  var splitPath = function(filename) {
    return splitPathRe.exec(filename).slice(1);
  };
  
  function parseURL(rest) {
    var res = urlcache[rest];
    if(!res) {
      res = {};
      var hash = rest.indexOf('#');
      if (hash !== -1) {
        res.hash = rest.substr(hash);
        rest = rest.slice(0, hash);
      }
      var qm = rest.indexOf('?');
      if (qm !== -1) {
        res.search = rest.substr(qm);
        res.query = rest.substr(qm + 1);
        rest = rest.slice(0, qm);
      } 
      if(rest) {
        res.pathname = rest;
      }
      if (res.hostname && !res.pathname) {
        res.pathname = '/';
      }
      if (res.pathname || res.search) {
        res.path = (res.pathname || '') + (res.search || '');
      }
      res.pathname = decodeURIComponent(res.pathname);
      urlcache[rest] = res;
    }
    return res;
  }
  function compare(a, b) {
    return a.name < b.name?-1:(a.name > b.name?1:0);
  }
  function generateIndex(req, url, cb) {
    var path = cfg.path + url.pathname;
    fs.readdir(path, function(err, files) {
      if(err) {
        return cb(err);
      }
      if(req.format === "application/json") {
        var ffiles = [];
        var fdirs = [];
        files.forEach(function(file) {
          //TODO: this is bad!!
          var st = fs.stat(path + file);
          if(st.mode & constants.S_IFREG) {
            ffiles.push({
              name: file,
              stat: st
            });
          }
          else if(st.mode & constants.S_IFDIR) {
            fdirs.push({
              name: file,
              stat: st
            });
          }
        });
        fdirs.sort(compare);
        ffiles.sort(compare);
        cb(err, JSON.stringify({
          dirs: fdirs,
          files: ffiles
        }));
      }
      else {
        req.format = "text/html";
        var html = [];
        html.push("<html>");
        html.push("<head>");
        html.push("<title>" + url.pathname + "</title>");
        html.push("<link href='http://fonts.googleapis.com/css?family=Ubuntu' ");
        html.push("rel='stylesheet' type='text/css'></link>");
        html.push("<link rel='stylesheet' href='/index.css'></link>");
        html.push("</head>");
        html.push("<body>");
        var ffiles = [];
        var fdirs = [];
        files.forEach(function(file) {
          //TODO: this is bad!!
          var st = fs.stat(path + file);
          if(st.mode & constants.S_IFREG) {
            ffiles.push({
              "name": file,
              "size": st.size,
              "mtime": st.mtime
            });
          }
          else if(st.mode & constants.S_IFDIR) {
            fdirs.push({
              "name": file,
              "mtime": st.mtime
            });
          }
        });
        fdirs.sort(compare);
        ffiles.sort(compare);
        html.push("<ul class=\"jqueryFileTree\" style=\"display: none;\">");
        fdirs.forEach(function(dir) {
          html.push("<li class=\"directory collapsed\">");
          html.push("<a href=\"#\" rel=\"" + url.pathname + dir.name+ "/\">" + dir.name + "</a>");
          html.push("</li>");
        });
        ffiles.forEach(function(file) {
          html.push("<li class=\"file ext_" + splitPath(file.name)[3].slice(1) + "\"><a href=\"#\" rel=\"" + url.pathname + file.name + "\">" + file.name + "</a></li>");
        });
        html.push("</ul>");
        html.push("</body>");
        html.push("</html>");
        cb(err, html.join(""));
      }
    });
  }
  this.run = function(peer) {
    var req = peer.request;
    var url = req.url;
    if(req.method === METHODS.GET && url[url.length-1] === "/") {
      url = parseURL(url);
      var idx = indexcache[url.pathname + req.format];
      if(idx) {
        return peer.writeResponse(idx.start, idx.length);
      }
      generateIndex(req, url, function(err, body) {
        if(err) {
          return _idx.next.run(peer);
        }
        body = "HTTP/1.1 200 OK  \r\n" + 
          "Date: Wed, 16 Apr 2014 05:36:05 GMT\r\n" + 
          "Cache-Control: public, max-age=0\r\n" + 
          "Connection: Keep-Alive\r\n" + 
          "Content-Length: " + body.length + "\r\n" + 
          "Last-Modified: " + new(Date)().toUTCString() + "\r\n" + 
          "Content-Type: " + req.format + "\r\n\r\n" + body;
        out.asciiWrite(body, out._start);
        indexcache[url.pathname + req.format] = {
          start: out._start,
          length: body.length
        };
        peer.writeResponse(out._start, body.length);
        out._start += body.length;
      });
      return;
    }
    _idx.next.run(peer);
  };
}
inherits(Job, Index);
function logger(cfg) {
  return new Logger(cfg);
}
function notFound(cfg) {
  return new NotFound(cfg);
}
function nullFunc(cfg) {
  return new Null(cfg);
}
function vhost(cfg) {
  return new Vhost(cfg);
}
function resty(cfg) {
  return new Resty(cfg);
}
function index(cfg) {
  return new Index(cfg);
}
function staticd(cfg) {
  return new Static(cfg);
}
function trace(cfg) {
  return new Trace(cfg);
}
function ws(cfg) {
  return new WebSocket(cfg);
}
module.exports = {
  logger: logger,
  vhost: vhost,
  resty: resty,
  index: index,
  "static": staticd,
  notFound: notFound,
  trace: trace,
  ws: ws,
  "null": nullFunc,
  Job: Job,
  inherits: inherits
};