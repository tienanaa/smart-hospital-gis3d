CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

CREATE TABLE IF NOT EXISTS UDM_Vertex (
    VertexID VARCHAR(50) PRIMARY KEY,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    z FLOAT NOT NULL
);

CREATE TABLE IF NOT EXISTS UDM_Edge (
    EdgeID VARCHAR(50) PRIMARY KEY,
    Start_Vertex VARCHAR(50) NOT NULL REFERENCES UDM_Vertex(VertexID) ON DELETE RESTRICT,
    End_Vertex VARCHAR(50) NOT NULL REFERENCES UDM_Vertex(VertexID) ON DELETE RESTRICT,
    Adjacent_Faces JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS UDM_Solid (
    SolidID VARCHAR(50) PRIMARY KEY,
    SpaceType VARCHAR(50) NOT NULL,
    Face_List JSONB NOT NULL DEFAULT '[]'::jsonb,
    Metadata JSONB DEFAULT '{}'::jsonb 
);

CREATE TABLE IF NOT EXISTS UDM_Face (
    FaceID VARCHAR(50) PRIMARY KEY,
    SolidID VARCHAR(50) NOT NULL REFERENCES UDM_Solid(SolidID) ON DELETE CASCADE,
    SurfaceType VARCHAR(50) NOT NULL, 
    Edge_List JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS UDM_Complex (
    ComplexID VARCHAR(50) PRIMARY KEY,
    Complex_Name VARCHAR(100) NOT NULL,
    Solid_List JSONB NOT NULL DEFAULT '[]'::jsonb, 
    Description TEXT
);
-- mô hình MẠNG 

CREATE TABLE IF NOT EXISTS Node (
    NodeID VARCHAR(50) PRIMARY KEY,

    -- Tọa độ 3D
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    z DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS Arc (
    ArcID VARCHAR(50) PRIMARY KEY,

    -- Nút đầu và nút cuối
    From_Node VARCHAR(50) NOT NULL
        REFERENCES Node(NodeID)
        ON DELETE RESTRICT,

    To_Node VARCHAR(50) NOT NULL
        REFERENCES Node(NodeID)
        ON DELETE RESTRICT,

    Left_Poly VARCHAR(50)
        REFERENCES UDM_Solid(SolidID)
        ON DELETE SET NULL,

    Right_Poly VARCHAR(50)
        REFERENCES UDM_Solid(SolidID)
        ON DELETE SET NULL,

    -- Chi phí di chuyển hai chiều
    Cost DOUBLE PRECISION NOT NULL,
    Reverse_Cost DOUBLE PRECISION NOT NULL,

    -- Kiểm tra tính hợp lệ
    CONSTRAINT chk_arc_different_nodes
        CHECK (From_Node <> To_Node),

    CONSTRAINT chk_arc_cost
        CHECK (Cost >= 0 AND Reverse_Cost >= 0),

    -- Toàn bộ tuyến đường cho phép đi hai chiều
    CONSTRAINT chk_bidirectional
        CHECK (Cost = Reverse_Cost)
);

-- INDEX: Hỗ trợ truy vấn mạng

CREATE INDEX IF NOT EXISTS idx_arc_from_node
    ON Arc(From_Node);

CREATE INDEX IF NOT EXISTS idx_arc_to_node
    ON Arc(To_Node);

CREATE INDEX IF NOT EXISTS idx_arc_left_poly
    ON Arc(Left_Poly);

CREATE INDEX IF NOT EXISTS idx_arc_right_poly
    ON Arc(Right_Poly);