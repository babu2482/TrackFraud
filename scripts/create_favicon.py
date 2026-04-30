#!/usr/bin/env python3
"""Create a minimal favicon.ico for the project."""
import struct
import os

def create_favicon():
    width = 16
    height = 16

    # ICO directory
    ico = b''
    ico += struct.pack('<3H', 0, 1, 1)  # Reserved, Type=1(Icon), Count=1
    ico += struct.pack('<4B2H2I',
        16, 16, 0, 0,      # Width, Height, ColorCount, Reserved
        1, 32,              # Planes, BitsPerPixel
        40 + 16*16*4,       # BytesInRes
        22                  # ImageOffset (6 + 16 = 22)
    )

    # BMP info header
    bmp = b''
    bmp += struct.pack('<I', 40)       # Header size
    bmp += struct.pack('<i', 16)       # Width
    bmp += struct.pack('<i', 32)       # Height (doubled for ICO format)
    bmp += struct.pack('<H', 1)        # Planes
    bmp += struct.pack('<H', 32)       # Bits per pixel
    bmp += struct.pack('<I', 0)        # Compression (none)
    bmp += struct.pack('<I', 0)        # Image size
    bmp += struct.pack('<i', 0)        # X pixels per meter
    bmp += struct.pack('<i', 0)        # Y pixels per meter
    bmp += struct.pack('<I', 0)        # Colors used
    bmp += struct.pack('<I', 0)        # Important colors

    # Pixel data: blue (#1e40af) with white diagonal pattern
    pixels = b''
    for row in range(16):
        for col in range(16):
            if abs(row - col) <= 2:
                # White pixels for the T/diagonal pattern
                pixels += bytes([255, 255, 255, 255])
            else:
                # Blue background (#1e40af = R:30, G:64, B:175)
                pixels += bytes([175, 64, 30, 255])

    output_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'favicon.ico')
    with open(output_path, 'wb') as f:
        f.write(ico + bmp + pixels)

    print(f'Favicon created at {output_path}')

if __name__ == '__main__':
    create_favicon()
