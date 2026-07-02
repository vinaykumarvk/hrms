import { createFoundationServices, FoundationServices } from "../platform/foundationServices";
import { ApiKernel, createApiKernel } from "../http/apiKernel";
import { registerG01Routes } from "./g01.routes";
import { registerG02Routes } from "./g02.routes";
import { registerG03Routes } from "./g03.routes";
import { registerG04Routes } from "./g04.routes";
import { registerG05Routes } from "./g05.routes";
import { registerG06Routes } from "./g06.routes";
import { registerG07Routes } from "./g07.routes";
import { registerG08Routes } from "./g08.routes";
import { registerG09Routes } from "./g09.routes";
import { registerG10Routes } from "./g10.routes";
import { registerG11Routes } from "./g11.routes";
import { registerG12Routes } from "./g12.routes";
import { registerG13Routes } from "./g13.routes";
import { registerG14Routes } from "./g14.routes";
import { registerP01WorkflowRoutes } from "./p01-workflow.routes";

export function registerFoundationRoutes(kernel: ApiKernel): void {
  registerP01WorkflowRoutes(kernel);
  registerG01Routes(kernel);
  registerG02Routes(kernel);
  registerG03Routes(kernel);
  registerG04Routes(kernel);
  registerG05Routes(kernel);
  registerG06Routes(kernel);
  registerG07Routes(kernel);
  registerG08Routes(kernel);
  registerG09Routes(kernel);
  registerG10Routes(kernel);
  registerG11Routes(kernel);
  registerG12Routes(kernel);
  registerG13Routes(kernel);
  registerG14Routes(kernel);
}

export function createFoundationApi(services: FoundationServices = createFoundationServices()): ApiKernel {
  const kernel = createApiKernel(services);
  registerFoundationRoutes(kernel);
  return kernel;
}

export * from "./g01.routes";
export * from "./g02.routes";
export * from "./g03.routes";
export * from "./g04.routes";
export * from "./g05.routes";
export * from "./g06.routes";
export * from "./g07.routes";
export * from "./g08.routes";
export * from "./g09.routes";
export * from "./g10.routes";
export * from "./g11.routes";
export * from "./g12.routes";
export * from "./g13.routes";
export * from "./g14.routes";
export * from "./p01-workflow.routes";
