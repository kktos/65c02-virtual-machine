export default function setupConsole(log) {
	const con = window.console;
	let buffer = "";

	function buildLine(...args) {
		let line = "";
		for (const arg of args) {
			if (typeof arg === "object") {
				if (Array.isArray(arg)) {
					line += "[...]";
				} else {
					for (const p in arg) {
						line += Array.isArray(arg[p]) ? `${p}:[...] ` : `${p}:${arg[p]} `;
					}
				}
			} else line += `${arg} `;
		}
		return line;
	}

	function customLog(...args) {
		buffer += `${buildLine(...args)}\n`;
	}

	function colorLog(color, ...args) {
		buffer += `<div class="log-${color}">${buildLine(...args)}</div>`;
	}

	function flush() {
		log.innerHTML += buffer;
		buffer = "";
	}

	function clear() {
		log.innerHTML = "";
		buffer = "";
	}

	window.console = {
		log: customLog,
		error: (...args) => con.error(...args),
		clog: colorLog,
		flush,
		clear,
	};
}
