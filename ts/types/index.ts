export interface StorageResultTreeNode {
  object: any;
  relations: { [key: string]: StorageResultTreeNode[] };
}
