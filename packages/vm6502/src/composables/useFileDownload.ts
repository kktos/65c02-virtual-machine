export function useFileDownload() {
	const downloadFile = (filename: string, mimeType: string, data: string | ArrayBuffer | Blob) => {
		const blob = new Blob([data], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	return {
		downloadFile,
	};
}
