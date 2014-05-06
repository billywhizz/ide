function ShellX(options, cb) {
    var linesCurrent = 0;
    var lines = [];
  options.cmd = options.cmd || "cmd1";
	var cmdel = document.getElementById(options.cmd);
	if(!cmdel) {
		cmdel = document.createElement("input");
		cmdel.setAttribute("tabindex", 1);
		cmdel.setAttribute("type", "text");
		cmdel.setAttribute("id", options.cmd);
		cmdel.setAttribute("class", options.class);
		cmdel.setAttribute("display", "block");
		options.container.append(cmdel);
	}
	var input = $("#" + options.cmd);
	this.history = function() {
		return(lines.join("\r\n"));
	}
  input.keydown(function (e) {
		if (e.keyCode == 38) {
			if (linesCurrent == lines.length) {
				if (input.val() != "") {
					lines.push(input.val());
				}
			}
			else if (input.val() != lines[linesCurrent]) {
				lines.push(input.val());
			}
			if (linesCurrent > 0) {
				linesCurrent--;
				input.val(lines[linesCurrent]);
			}
			return false;
		}
		else if (e.keyCode == 40) {
			if (linesCurrent == lines.length) {
				if (input.val() != "") {
					lines.push(input.val());
					linesCurrent++;
					input.val("");
				}
			}
			else {
				if (input.val() != lines[linesCurrent]) {
					lines.push(input.val());
				}
				linesCurrent++;
				if (lines[linesCurrent] != null) {
					input.val(lines[linesCurrent]);
				}
				else {
					input.val("");
				}
			}
			return false;
		}
		if (e.keyCode != 13 /* Return */) return;
		var msg = input.val().replace("\n", "");
    lines.push(input.val());
    if(cb) cb(msg);
		linesCurrent = lines.length;
		input.val(""); // clear the input field.
	});
}