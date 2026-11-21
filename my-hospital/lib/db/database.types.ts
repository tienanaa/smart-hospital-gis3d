export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type Vertex = {
  vertexid: string;
  x: number;
  y: number;
  z: number;
};

export type Database = {
  public: {
    Tables: {
      udm_vertex: Table<Vertex>;
      udm_edge: Table<{
        edgeid: string;
        start_vertex: string;
        end_vertex: string;
        adjacent_faces: Json;
      }>;
      udm_solid: Table<{
        solidid: string;
        spacetype: string;
        face_list: Json;
        metadata: Json | null;
        floor_level: number;
      }>;
      udm_face: Table<{
        faceid: string;
        solidid: string;
        surfacetype: string;
        edge_list: Json;
      }>;
      udm_complex: Table<{
        complexid: string;
        complex_name: string;
        solid_list: Json;
        description: string | null;
      }>;
      node: Table<{
        nodeid: string;
        x: number;
        y: number;
        z: number;
      }>;
      node_solid: Table<{
        nodeid: string;
        solidid: string;
      }>;
      arc: Table<{
        arcid: string;
        from_node: string;
        to_node: string;
        left_poly: string | null;
        right_poly: string | null;
        cost: number;
        reverse_cost: number;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
