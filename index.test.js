const fs = require("fs");
const path = require("path");
const action = require("./action");
const tc = require("@actions/tool-cache");
const core = require("@actions/core");

const baseURL = "https://localhost/csc/clients"

describe("run", () => {
  test("should unzip Windows zip", async () => {
    // Arrange
    jest.spyOn(tc, "find").mockReturnValue();
    jest.spyOn(tc, "cacheDir").mockReturnValue("/dapr/");
    let extractZip = jest.spyOn(tc, "extractZip").mockReturnValue();
    jest.spyOn(tc, "downloadTool").mockReturnValue("dapr_darwin_amd64.tar.gz");

    jest.spyOn(fs, "chmodSync").mockReturnValue();
    jest.spyOn(fs, "readdirSync").mockReturnValue(["dapr.exe"]);
    jest.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        false;
      },
    });

    // Act
    await action.run("Windows_NT", "1.0.0");

    // Restore mocks so the testing framework can use the fs functions
    jest.restoreAllMocks();

    // Assert
    expect(extractZip).toHaveBeenCalledTimes(1);
  });
});