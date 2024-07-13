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
    jest.spyOn(tc, "cacheDir").mockReturnValue("/home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64");
    let extractTar = jest.spyOn(tc, "extractTar").mockReturnValue("/home/sysadmin/actions-runner/_work/_temp/Venafi_CSP");
    jest.spyOn(tc, "downloadTool").mockReturnValue("/home/sysadmin/actions-runner/_work/_temp/Venafi_CSP");

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

describe("getCSPDriverDownloadURL", () => {
  test("should download the Windows version", () => {
    // Act
    let url = action.getCSPDriverDownloadURL("https://localhost/csc/clients", "Windows_NT", "24.1.0");

    // Assert
    expect(url).toEqual(
      "https://localhost/csc/clients/VenafiCodeSigningClients-24.1.0-x64.zip"
    );
  });

  test("should download the Linux version", () => {
    // Act
    let url = action.getCSPDriverDownloadURL("https://localhost/csc/clients","Linux", "24.1.0");

    // Assert
    expect(url).toEqual(
      "https://localhost/csc/clients/venafi-codesigningclients-24.1.0-linux-x86_64.tar.gz"
    );
  });

});

describe("download CSPDriver", () => {
  test("should return toolPath", async () => {
    // Arrange
    jest.spyOn(tc, "find").mockReturnValue("/home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64");

    jest.spyOn(path, "join").mockReturnValue("/home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64/opt/venafi/codesign/bin/pkcs11config");

    jest.spyOn(fs, "chmodSync").mockReturnValue();
    jest.spyOn(fs, "readdirSync").mockReturnValue(["pkcs11config"]);
    jest.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return false;
      },
    });

    // Act
    let actual = await action.downloadCSPDriver("https://localhost/csc/clients", "Linux", "24.1.0");

    // Assert
    // Restore mocks so the testing framework can use the fs functions
    jest.restoreAllMocks();
    expect(actual).toBe("/home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64/opt/venafi/codesign/bin/pkcs11config");
  });

  test("should throw if CSPDriver can't be found", async () => {
    // Arrange
    // If 3 assertions are not tested that means the exception
    // was not thrown
    expect.assertions(3);

    jest.spyOn(tc, "find").mockReturnValue("/home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64");
    jest.spyOn(tc, "cacheDir").mockReturnValue("/home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64");
    let extractTar = jest.spyOn(tc, "extractTar").mockReturnValue();
    jest.spyOn(tc, "downloadTool").mockReturnValue("/home/sysadmin/actions-runner/_work/_temp/Venafi_CSP");

    jest.spyOn(path, "join").mockReturnValue("");

    jest.spyOn(fs, "chmodSync").mockReturnValue();
    jest
      .spyOn(fs, "readdirSync")
      .mockReturnValueOnce(["pkcs11config"])

    jest
      .spyOn(fs, "statSync")
      .mockReturnValueOnce({
        isDirectory: () => {
          return true;
        },
      })
      .mockReturnValueOnce({
        isDirectory: () => {
          return false;
        },
      });

    try {
      // Act
      await action.downloadCSPDriver("https://localhost/csc/clients", "Linux", "24.1.0");
    } catch (error) {
      // Restore mocks so the testing framework can use the fs functions
      jest.restoreAllMocks();

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty(
        "message",
        "CSP Driver package not found in path /home/sysadmin/actions-runner/_work/_tool/Venafi_CSP/24.1.0/x64"
      );

      // Number of calls should be zero because of the error
      expect(extractTar).toHaveBeenCalledTimes(0);
    }
  });

  test("should throw on download failure", async () => {
    // Arrange
    expect.assertions(2);

    jest.spyOn(tc, "find").mockReturnValue();
    jest.spyOn(tc, "downloadTool").mockImplementation(() => {
      throw "error";
    });

    try {
      // Act
      await action.downloadCSPDriver("https://localhost/csc/clients","Linux", "24.1.0");
    } catch (error) {
      // Restore mocks so the testing framework can use the fs functions
      jest.restoreAllMocks();

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty(
        "message",
        "Failed to download CSPDriver from location https://localhost/csc/clients/venafi-codesigningclients-24.1.0-linux-x86_64.tar.gz"
      );
    }
  });

});