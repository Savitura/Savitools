import "reflect-metadata";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AppModule } from "./app.module";
import { MultisigController } from "./modules/multisig/multisig.controller";
import { MultisigModule } from "./modules/multisig/multisig.module";

/**
 * Route contract for the multisig surface (#431). The web client calls
 * `/multisig/limits` and `/multisig/simulate`; this pins both the module
 * registration and the controller paths so the route group cannot disappear.
 */
describe("multisig route contract (#431)", () => {
  it("registers MultisigModule in AppModule", () => {
    const imports = Reflect.getMetadata("imports", AppModule) ?? [];
    expect(imports).toContain(MultisigModule);
  });

  it("exposes GET /multisig/limits", () => {
    expect(Reflect.getMetadata(PATH_METADATA, MultisigController)).toBe(
      "multisig",
    );
    const handler = MultisigController.prototype.getLimits;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("limits");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it("exposes POST /multisig/simulate", () => {
    const handler = MultisigController.prototype.simulate;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("simulate");
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });
});
