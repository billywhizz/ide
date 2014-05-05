"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */
var fs = process.binding("fs");
var constants = process.binding("constants");
function FileCache(path, mime) {
  var pending = {};
  var openfiles = {};
  var failed = {};
  function flushPending(url, err, file) {
    var q = pending[url];
    var l = q.length;
    var n;
    while(l--) {
      n = q.shift();
      n.cb(err, file, n.req);
    }
  }
  function readFile(fd, size, cb) {
    var off = 0;
    if(size === 0) {
      return cb(null, null, off);
    }
    var buf = new Buffer(size);
    function chunk(err, bytesRead) {
      if(err) {
        return cb(err);
      }
      off += bytesRead;
      if(bytesRead > 0 && off < size) {
        return fs.read(fd, buf, off, size - off, off, chunk);
      }
      cb(null, buf, off);
    }
    fs.read(fd, buf, off, size - off, 0, chunk);
  }
  function loadFile(req, bout, cb) {
    var url = req.url;
    var file;
    file = failed[url];
    if(file) {
      return cb(failed[url], null, req);
    }
    file = openfiles[url];
    if(file) {
      return cb(null, file, req);
    }
    if((pending.hasOwnProperty(url)) && pending[url].length) {
      return pending[url].push({req: req, cb: cb});
    }
    var fd, fstat;
    var fn = path + url;
    function readHandler(err, buf, len) {
      if(err) {
        failed[url] = err;
        return flushPending(url, err);
      }
      var extension = url.split(".").pop();
      //var cachecontrol = "public, max-age=86400, s-maxage=86400";
      var cachecontrol = "public, max-age=0";
      file = {
        path: fn,
        size: fstat.size,
        fd: fd,
        mime: mime[extension] || "text/plain",
        modified: Date.parse(fstat.mtime),
        stat: fstat,
        etag: [fstat.ino.toString(16), 
          fstat.size.toString(16), 
          Date.parse(fstat.mtime).toString(16)
        ].join("-")
      };
      file.headers = "HTTP/1.1 200 OK  \r\nDate: Wed, 16 Apr 2014 05:36:05 GMT\r\nCache-Control: " + 
        cachecontrol + 
        "\r\nConnection: Keep-Alive\r\nContent-Length: " + 
        fstat.size + 
        "\r\nLast-Modified: " + 
        new(Date)(fstat.mtime).toUTCString() + 
        "\r\nContent-Type: " + 
        file.mime + 
        "\r\n\r\n";
      var off = bout._start;
      file.start = off;
      bout.asciiWrite(file.headers, off, file.headers.length);
      off += file.headers.length;
      if(len > 0) {
        file.body = buf.binarySlice(0, len);
        bout.binaryWrite(file.body, off, file.body.length);
        off += file.body.length;
      }
      file.length = off - file.start;
      openfiles[url] = file;
      if(failed.hasOwnProperty(url)) {
        delete failed[url];
      }
      var watcher = new fs.StatWatcher();
      watcher.onchange = function(curr, prev) {
        if(Date.parse(curr.mtime) != Date.parse(prev.mtime)) {
          delete openfiles[url];
        }
      }
      watcher.onstop = function() {
        console.log("watcher stopped: " + fn);
      }
      watcher.start(fn, false, 3000);
      bout._start = off;
      fs.close(fd);
      flushPending(url, null, file);
    }
    function statHandler(err, ffstat) {
      if(err) {
        failed[url] = err;
        return flushPending(url, err);
      }
      fstat = ffstat;
      readFile(fd, fstat.size, readHandler);
    }
    function openHandler(err, ffd) {
      if(err) {
        failed[url] = err;
        return flushPending(url, err);
      }
      fd = ffd;
      fs.fstat(ffd, statHandler);
    }
    function accessHandler(err, r) {
      if(err) {
        failed[url] = err;
        return flushPending(url, err);
      }
      fs.open(fn, constants.O_RDONLY, 0x1ED, openHandler);
    }
    pending[url] = [{req: req, cb: cb}];
    fs.open(fn, constants.O_RDONLY, 0x1ED, openHandler);
    //fs.access(fn, constants.O_RDONLY, accessHandler);
  }
  this.serve = loadFile;
}
exports.FileCache = FileCache;