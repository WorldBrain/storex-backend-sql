export type ObjectPath = ObjectPathElement[]
export type ObjectPathElement = string

export interface StorageResultTreeNode {
  object: any;
  relations: { [key: string]: StorageResultTreeNode[] };
}
