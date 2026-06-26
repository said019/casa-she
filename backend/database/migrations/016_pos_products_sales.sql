-- Migration: POS - Products, Categories & Sales
-- Creates tables for Point of Sale system

-- Product Categories
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost NUMERIC(10, 2) DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 5,
    sku VARCHAR(50),
    image_url TEXT,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(10, 2) DEFAULT 0,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
    notes TEXT,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories
INSERT INTO product_categories (name, description) VALUES
    ('Bebidas', 'Aguas, jugos, smoothies'),
    ('Ropa', 'Sudaderas, playeras, accesorios'),
    ('Snacks', 'Barras, frutos secos'),
    ('Accesorios', 'Ligas, toallas, mats')
ON CONFLICT DO NOTHING;
