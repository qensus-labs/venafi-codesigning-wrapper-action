const fs = require("fs");
const path = require("path");
const action = require("./action");
const tc = require("@actions/tool-cache");
const core = require("@actions/core");

const baseURL = "https://localhost/csc/clients"

describe("run", () => {
  test("should untar Linux archive", async () => {
    // Arrange
    jest.spyOn(tc, "find").mockReturnValue();
    jest.spyOn(tc, "cacheDir").mockReturnValue("/home/sysadmin/actions-runner/_work/_tool/CSPDriver/24.1.0/x64");
    let extractTar = jest.spyOn(tc, "extractTar").mockReturnValue("/home/sysadmin/actions-runner/_work/_temp/CSPDriver");
    jest.spyOn(tc, "downloadTool").mockReturnValue("/home/sysadmin/actions-runner/_work/_temp/CSPDriver");

    jest.spyOn(fs, "chmodSync").mockReturnValue();
    jest.spyOn(fs, "readdirSync").mockReturnValue(["pkcs11config"]);
    jest.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        false;
      },
    });
    jest.spyOn(fs, "rmdirSync").mockReturnValue();

    // Act
    await action.run("Linux", "24.1.0");

    // Restore mocks so the testing framework can use the fs functions
    jest.restoreAllMocks();

    // Assert
    expect(extractTar).toHaveBeenCalledTimes(1);
  });
});