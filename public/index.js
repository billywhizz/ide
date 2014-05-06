var splitPathRe = 
  /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};
var term;
var socket;
var editor;
var cmdline;
function newTerminal(cols, rows, cb) {
  var container;
  var cell;
  socket = new WebSocket("ws://" + document.location.host + "/", "oneflow");
  socket.binaryType = "arraybuffer";
  socket.onopen = function() {
    container = document.createElement("div");
    container.id = "tty0";
    container.className = "container";
    term = new Terminal({
      cols: cols,
      rows: rows,
      parent: container,
      handler: function(data) {}
    });
    term.cell = cell;
    term.container = container;
    term.socket = socket;
    term.on("title", function(title) {
      document.title = title;
    });
    term.on("close", function() {
      console.log("close: " + container.id);
    });
    term.brokenBold = true;
    term.open();
    shell.appendChild(container);
    if(cb) cb(term);
  };
  socket.onclose = function() {
    if(term) {
      term.destroy();
      shell.removeChild(container);
      newTerminal(80, 40);
    }
  };
  socket.onmessage = function(event) {
    var bytearray = new Uint8Array(event.data);
    term.write(bytearray);
  };
}
$(document).ready( function() {
  document.addEventListener("keydown", function(e) {
    if (e.keyCode == 83 && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      // Process event...
    }
  }, false);
  var lang = require("ace/ext/modelist")
  editor = ace.edit("editcontainer");
  editor.setTheme("ace/theme/xcode");
  editor.getSession().setUseSoftTabs(true);
  editor.getSession().setTabSize(2);
  editor.commands.addCommand({
    name: 'New Directory',
    bindKey: {win: 'Ctrl-M',  mac: 'Command-M'},
    exec: function(editor) {
      var req = new XMLHttpRequest();
      req.onreadystatechange = function(e) {
        switch(req.readyState) {
          case 4:
            if(req.status === 201) {
              console.log(req.cwd + " created");
            }
            else {
              console.log("bad http status: " + req.status);
            }
            break;s
        }
      };
      req.cwd = prompt("Please enter the directory name", editor.cwd);
      req.open("MKCOL", req.cwd, true);
      req.send();
    },
    readOnly: false
  });
  editor.commands.addCommand({
    name: 'New File',
    bindKey: {win: 'Ctrl-N',  mac: 'Command-N'},
    exec: function(editor) {
      editor.setValue("");
      editor.filename = document.title = prompt("Please enter the file name", editor.cwd);
    },
    readOnly: false
  });
  editor.commands.addCommand({
    name: 'Save',
    bindKey: {win: 'Ctrl-S',  mac: 'Command-S'},
    exec: function(editor) {
      var req = new XMLHttpRequest();
      req.onreadystatechange = function(e) {
        switch(req.readyState) {
          case 4:
            if(req.status === 201) {
              console.log(req.filename + " saved");
            }
            else {
              console.log("bad http status: " + req.status);
            }
            break;s
        }
      };
      req.filename = editor.filename;
      req.open("PUT", editor.filename, true);
      req.send(editor.getValue());
    },
    readOnly: false
  });
  editor.commands.addCommand({
    name: 'Delete',
    bindKey: {win: 'Ctrl-X',  mac: 'Command-X'},
    exec: function(editor) {
      var req = new XMLHttpRequest();
      req.onreadystatechange = function(e) {
        switch(req.readyState) {
          case 4:
            if(req.status === 200) {
              console.log(req.filename + " deleted");
            }
            else {
              console.log("bad http status: " + req.status);
            }
            break;s
        }
      };
      req.filename = editor.filename;
      req.open("DELETE", editor.filename, true);
      req.send();s
    },
    readOnly: false
  });
  editor.commands.addCommand({
    name: 'Remove Directory',
    bindKey: {win: 'Ctrl-Z',  mac: 'Command-Z'},
    exec: function(editor) {
      var req = new XMLHttpRequest();
      req.onreadystatechange = function(e) {
        switch(req.readyState) {
          case 4:
            if(req.status === 200) {
              console.log(req.cwd + " deleted");
            }
            else {
              console.log("bad http status: " + req.status);
            }
            break;
        }
      };
      req.cwd = editor.cwd;
      req.open("DELETE", editor.cwd, true);
      req.send();
    },
    readOnly: false
  });
  editor.cwd = "/user/";
  cmdline = new ShellX({
    "container": $("#commander"),
    "class": "shell"
  }, function(command) {
    switch(command) {
      default:
        socket.send(JSON.stringify({
          type: "command",
          command: command,
          cwd: editor.cwd
        }));
        break;
    }
  });
  $('#solution').fileTree({
    root: '/user/',
    expandSpeed: -1,
    collapseSpeed: -1
  }, function(type, name) {
    if(type === "dir") {
      editor.cwd = name;
      return;
    }
    var req = new XMLHttpRequest();
    req.onreadystatechange = function(e) {
      switch(req.readyState) {
        case 4:
          if(req.status === 200) {
            editor.getSession().setMode(lang.getModeForPath(name).mode);
            editor.setValue(req.response);
            editor.filename = document.title = name;
            editor.clearSelection();
          }
          else {
            console.log("bad http status: " + req.status);
          }
          break;s
      }
    };
    req.open("GET", name, true);
    req.send();
  });
  newTerminal(80, 60);
});