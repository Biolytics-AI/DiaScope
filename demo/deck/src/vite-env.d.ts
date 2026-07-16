/// <reference types="vite/client" />
declare module "*.yaml?raw" { const text: string; export default text; }
declare module "*.d2?raw" { const text: string; export default text; }
