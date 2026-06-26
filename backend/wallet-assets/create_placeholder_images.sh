#!/bin/bash
# Script para crear imágenes placeholder PNG para Apple Wallet

# Crear imagen de 1x1 pixel transparente en base64
TINY_PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

# Decodificar y guardar como archivos PNG
echo "$TINY_PNG" | base64 -d > icon.png
echo "$TINY_PNG" | base64 -d > icon@2x.png
echo "$TINY_PNG" | base64 -d > icon@3x.png
echo "$TINY_PNG" | base64 -d > logo.png
echo "$TINY_PNG" | base64 -d > logo@2x.png
echo "$TINY_PNG" | base64 -d > logo@3x.png
echo "$TINY_PNG" | base64 -d > strip.png
echo "$TINY_PNG" | base64 -d > strip@2x.png
echo "$TINY_PNG" | base64 -d > strip@3x.png

echo "✅ Imágenes placeholder creadas"
ls -lh *.png
