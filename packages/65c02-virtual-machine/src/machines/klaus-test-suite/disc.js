export default class Disk {
	constructor(_vm) {
		console.log("new Disk");
	}

	setImage(_diskID, _imgData) {}

	async handleMessage(_msg) {}

	async read_file(_diskID, { _filename }) {}

	async read(_diskID, { _track, _sector, _addr, _length }) {}

	async readSector(_diskID, _track, _sector, _addr, _isInterleaved) {}
}
