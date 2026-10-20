import "reflect-metadata";
import { AppModule } from "./app.module";
import { MultisigModule } from "./modules/multisig/multisig.module";

describe("AppModule", () => {
  it("registers MultisigModule so the /multisig routes are mounted", () => {
    const imports = Reflect.getMetadata("imports", AppModule) as unknown[];

    expect(imports).toContain(MultisigModule);
  });
});
