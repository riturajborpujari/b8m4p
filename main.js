const fs		= require("node:fs/promises");
const ref		= require("ref-napi");
const raylib	= require("raylib");

async function main() {
	const filepath = process.argv[2];
	if (!filepath) {
		console.error("invalid usage");
		console.log("usage:", process.argv[0], process.argv[1], "FILE");
		process.exit(1);
	}

	console.log("INFO: Reading BMP file", filepath);
	const file = await fs.open(filepath, "r");

	const buf = Buffer.alloc(14 + 20);
	await file.read(buf, 0, 14, 0);

	const fileSize			= buf.readUint32LE(2);
	const pixelArrayOffset	= buf.readUint32LE(10);

	console.log("INFO: Image Meta");
	console.log("\tFile Size (bytes) :", fileSize);
	console.log("\tPixel Array offset:", pixelArrayOffset);

	await file.read(buf, 14, 20, 14);
	const dibHeaderSize				= buf.readUint32LE(14);
	const imgWidth					= buf.readUint32LE(18);
	const imgHeight					= buf.readUint32LE(22);
	const bitsPerPixel  			= buf.readUint16LE(28);
	const compression   			= buf.readUint32LE(30);

	console.log("\tDIB Header size   :", dibHeaderSize);
	console.log("\tResolution        :", imgWidth, "x", imgHeight);
	console.log("\tBits per pixel    :", bitsPerPixel);
	console.log("\tCompression       :", compression);

	if (compression != 0) {
		// compression = 0 means R8G8B8 uncompressed
		console.error("ERROR: Unsupported Compression format:", compression);
		file.close();
		process.exit(0);
	}

	const bytesPerPixel				= bitsPerPixel / 8;
	const rowDataSize				= imgWidth * bytesPerPixel;
	const rowDataSizeWithPadding	= Math.ceil(rowDataSize / 4) * 4;

	const imageRowData				= Buffer.alloc(rowDataSizeWithPadding);
	let rowOffset					= pixelArrayOffset;
	let curRow						= 0;
	
	const imgData = Buffer.alloc(imgWidth * imgHeight * bytesPerPixel);

	while (curRow < imgHeight) {
		await file.read(imageRowData, 0, rowDataSizeWithPadding, rowOffset);

		for (let col = 0; col < imgWidth; col++) {
			// BMP file stores in B8G8R8 order
			const b	= imageRowData.readUint8(col * bytesPerPixel + 0);
			const g	= imageRowData.readUint8(col * bytesPerPixel + 1);
			const r	= imageRowData.readUint8(col * bytesPerPixel + 2);

			const color = (r + g + b ) / 3;		// can be used for black & white image outut

			imgData.writeUint8(r, (imgHeight - curRow - 1) * rowDataSize + col * bytesPerPixel + 0);
			imgData.writeUint8(g, (imgHeight - curRow - 1) * rowDataSize + col * bytesPerPixel + 1);
			imgData.writeUint8(b, (imgHeight - curRow - 1) * rowDataSize + col * bytesPerPixel + 2);
		}
		
		rowOffset += rowDataSizeWithPadding;
		curRow++;
	}
	file.close();

	const image = {
		data: ref.address(imgData),				// raylib requires raw memory pointer
		height: imgHeight,
		width: imgWidth,
		mipmaps: 1,
		format: raylib.PIXELFORMAT_UNCOMPRESSED_R8G8B8
	};

	raylib.InitWindow(imgWidth, imgHeight, "b8m4p");
	const texture = raylib.LoadTextureFromImage(image);

	while (!raylib.WindowShouldClose()) {
		raylib.BeginDrawing();
		raylib.ClearBackground(raylib.BLACK);
		raylib.DrawTexture(texture, 0, 0, raylib.WHITE);
		raylib.EndDrawing();
	}

	raylib.UnloadTexture(texture);
	raylib.CloseWindow();

}

main()
	.catch(err => {
		console.error("ERROR: fatal:", err.message);
	})
