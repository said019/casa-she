#!/bin/bash

# 🧪 Script de testing rápido del sistema de migración
# Ejecutar: bash test-migration-api.sh

echo "🧪 Testing Migration API Endpoints"
echo "=================================="
echo ""

API_URL="https://valiant-imagination-production-0462.up.railway.app/api"

# Necesitas un token de admin válido para estos tests
# Obtén uno haciendo login en la plataforma primero
echo "⚠️  Este script requiere un TOKEN de admin válido"
echo "Por favor, obtén tu token haciendo login en la plataforma"
echo ""
read -p "Ingresa tu token de admin: " TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ Token requerido para continuar"
    exit 1
fi

echo ""
echo "=================================="
echo ""

# Test 1: GET /api/migrations/plans
echo "📋 Test 1: Obtener planes disponibles"
echo "GET $API_URL/migrations/plans"
echo ""
curl -s -X GET "$API_URL/migrations/plans" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[0:3]' || echo "❌ Error al obtener planes"

echo ""
echo "----------------------------------"
echo ""

# Test 2: GET /api/migrations/stats
echo "📊 Test 2: Obtener estadísticas"
echo "GET $API_URL/migrations/stats"
echo ""
curl -s -X GET "$API_URL/migrations/stats" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.' || echo "❌ Error al obtener estadísticas"

echo ""
echo "----------------------------------"
echo ""

# Test 3: GET /api/migrations/history
echo "📜 Test 3: Obtener historial (últimas 5)"
echo "GET $API_URL/migrations/history?limit=5"
echo ""
curl -s -X GET "$API_URL/migrations/history?limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[0:2]' || echo "❌ Error al obtener historial"

echo ""
echo "----------------------------------"
echo ""

echo "✅ Tests completados"
echo ""
echo "Para probar POST /api/migrations/client, usa la interfaz web"
echo "o ejecuta una request manual con todos los datos requeridos."
