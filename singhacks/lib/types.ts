export type SerializablePrimitive = string | number | boolean | null | undefined;

export type Serializable =
  | SerializablePrimitive
  | Serializable[]
  | {
      [key: string]: Serializable;
    };

export type SerializableRecord = Record<string, Serializable>;
