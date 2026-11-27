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
        is_emergency_exit: boolean;
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
        is_blocked: boolean;
      }>;
      fire_scenarios: Table<{
        scenarioid: string;
        scenarioname: string;
        description: string | null;
      }>;
      voxel_grid_config: Table<{
        configid: string;
        x_min: number;
        y_min: number;
        z_min: number;
        x_max: number;
        y_max: number;
        z_max: number;
        dx: number;
        dy: number;
        dz: number;
        smoke_penalty: number;
        smoke_block: number;
        temp_penalty: number;
        temp_block: number;
        penalty_factor: number;
      }>;
      voxel_state: Table<{
        scenarioid: string;
        time_step: number;
        i_idx: number;
        j_idx: number;
        k_idx: number;
        smoke_density: number;
        temperature: number;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
