declare module "d3-force" {
  export function forceSimulation(nodes?: any[]): any;
  export function forceCollide(radius?: number | ((node: any) => number)): any;
  export function forceLink(links?: any[]): any;
  export function forceManyBody(): any;
  export function forceX(x?: number | ((node: any) => number)): any;
  export function forceY(y?: number | ((node: any) => number)): any;
}
