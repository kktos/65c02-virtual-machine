export interface RegisterDescriptor {
	key: string;
	label: string;
	size: number; // bytes
	read(): number | boolean;
	write?(value: number): void; // optional → read-only register
	isVirtual?: boolean;
}
