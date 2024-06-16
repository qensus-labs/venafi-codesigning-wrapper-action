const fs = require("fs");
const util = require("util");
const path = require("path");
const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");

// The name of the tool we are installing with this action.
const toolName = "CSPDriver";

// Base form of the the URL to download the release archives. As long as this
// does not change this will be able to download any version the CLI.
const baseURL = core.getInput('csc-url') + '/clients';

const authURL = core.getInput('csp-auth-url');

const hsmURL = core.getInput('csp-hsm-url');


async function setCSPDriverDefaultConfig(currentOs, cachedPath, authURL, hsmURL) {
  
  var result = "";
  const options = {
    listeners: {
      stdout: (data) => { result += data.toString() }
    }
  }

  switch (currentOs) {
    case "Linux":
      await exec.exec(cachedPath, ['seturl',util.format("%s=%s",'--authurl', authURL),util.format("%s=%s",'--hsmurl', hsmURL)] );
      await exec.exec(cachedPath, ['option','--show'], options );
      break;

    case "Windows_NT":
    default:
      await exec.exec(cachedPath, ['seturl',util.format("%s=%s",'--authurl', authURL),util.format("%s=%s",'--hsmurl', hsmURL)] );
      await exec.exec(cachedPath, ['option','--show'], options );
      break;
  }
  return result;
}


// Returns the URL used to download a specific version of the CSP Driver (either PKCS11 for Linux or CSP for Windows) for a
// specific platform.
function getCSPDriverDownloadURL(baseURL, currentOs, version) {
  var file = "";
  switch (currentOs) {
    case "Linux":
      file = `venafi-codesigningclients-${version}-linux-x86_64.tar.gz`;
      break;

    case "Windows_NT":
    default:
      file = `VenafiCodeSigningClients-${version}-x64.zip`;
      break;
  }

  return util.format("%s/%s", baseURL, file);
}


// Downloads and installs the package to the runner and returns the path.
async function downloadCSPDriver(baseURL, currentOs, version) {
  // See if we have cached this tool already
  let cachedToolPath = tc.find(toolName, version);

  core.debug(`find: ${cachedToolPath}`)

  // If we did not find the tool in the cache download it now.
  if (!cachedToolPath) {
    let downloadPath;
    let downloadUrl = getCSPDriverDownloadURL(baseURL, currentOs, version);
    try {
      core.info(`Downloading CSP Driver from ${downloadUrl}...`);
      downloadPath = await tc.downloadTool(downloadUrl);
      core.debug(`downloadTool: ${downloadPath}`);
    } catch (exception) {
      throw new Error(
        util.format("Failed to download CSPDriver from location", downloadUrl),
        core.error(`The following axception occured: ${exception}`)
      );
    }
    // (chmod a+rwx) sets permissions so that, User / owner can read, can
    // write and can execute. Group can read, can write and can execute.
    // Others can read, can write and can execute.
    fs.chmodSync(downloadPath, "777");

    // Stores the path where the archive was extracted
    let installedToolPath;
    if (currentOs === "Windows_NT") {
      fs.renameSync(downloadPath, downloadPath + '.zip' );
      installedToolPath = await tc.extractZip(downloadPath + '.zip',downloadPath);
      core.debug(`extractZip: ${installedToolPath}`);
    } else {
      // Both Linux and macOS use a .tar.gz file
      installedToolPath = await tc.extractTar(downloadPath);
      core.debug(`extractTar: ${installedToolPath}`);
      // Fix to remove usr dir otherwise broken links exists
      fs.rmdirSync (installedToolPath + `/usr`, { recursive: true, force: true });

    }

    // Cache to tool so we do not have to download multiple times
    cachedToolPath = await tc.cacheDir(installedToolPath, toolName, version);

    core.debug(`cacheDir: ${cachedToolPath}`);
  }

  // Get the full path to the executable
  const toolPath = findTool(currentOs, cachedToolPath);
  if (!toolPath) {
    throw new Error(
      util.format("CSP Driver package not found in path", cachedToolPath)
    );
  }

  core.info(`CSP Driver installed to ${toolPath}...`);

  // (chmod a+rwx) sets permissions so that, User / owner can read, can
  // write and can execute. Group can read, can write and can execute.
  // Others can read, can write and can execute.
  fs.chmodSync(toolPath, "777");

  return toolPath;
}

// Returns a install path of the desired tool
function findTool(currentOs, rootFolder) {
  core.info(`findTool started for ${rootFolder}`);
  fs.chmodSync(rootFolder, "777");
  core.info(`Chmod stopped`);
  // Holds all the paths. The tool might be installed in multiple locations.
  var fileList;

  // walkSync is recursive which is why we pass in fileList and assign it the
  // return value of this function.
  fileList = walkSync(
    rootFolder,
    fileList,
    getExecutableName(currentOs)
  );

  if (!fileList || fileList.length == 0) {
    throw new Error(
      util.format("CSP Driver executable not found in path", rootFolder)
    );
  } else {
    // Return the first one we find.
    core.info(`Following found ${fileList}`);
    return fileList[0];
  }
}

// Returns the full name of the executable with extension if any. On Linux and
// macOS the executable does not have an extension but on Windows it does.
function getExecutableName(currentOs) {
  var executableName = "";
  switch (currentOs) {
    case "Linux":
      executableName = `pkcs11config`;
      break;

    case "Windows_NT":
    default:
      executableName = `CSPConfig.exe`;
      break;
  }
  return executableName;
}

// Returns a list of path to the fileToFind in the dir provided.
function walkSync(dir, fileList, fileToFind) {
  var files = fs.readdirSync(dir);

  core.debug(`readdirSync: ${files}`);

  fileList = fileList || [];
  files.forEach(function (file) {
    let statsSync = fs.statSync(path.join(dir, file)).isDirectory() 
    core.debug(`statSync: ${statsSync}`);
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      fileList = walkSync(path.join(dir, file), fileList, fileToFind);
    } else {
      core.debug(file);
      if (file == fileToFind) {
        fileList.push(path.join(dir, file));
      }
    }
  });

  return fileList;
}

// The main function of this action. After the archive is downloaded and
// extracted this function adds it location to the path. This will make sure
// other steps in your workflow will be able to call the CSP Driver.
async function run(currentOs, version) {
  let cachedPath = await downloadCSPDriver(baseURL, currentOs, version);

  if (!process.env["PATH"].startsWith(path.dirname(cachedPath))) {
    core.addPath(path.dirname(cachedPath));
  }

  let cachedConfig

  if (core.getInput('include-config') == 'true') {
    cachedConfig = await setCSPDriverDefaultConfig(currentOs, cachedPath, authURL, hsmURL);
  }

  core.info(`CSP Driver version: '${version}' has been cached at ${cachedPath}`);

  // set a an output of this action incase future steps need the path to the tool.
  core.setOutput("csp-driver-cached-config", cachedConfig);
  core.setOutput("csp-driver-cached-path", cachedPath);
  core.setOutput("csp-driver-cached-version", version);
}

module.exports = {
  run: run,
  setCSPDriverDefaultConfig: setCSPDriverDefaultConfig,
  downloadCSPDriver: downloadCSPDriver,
  getCSPDriverDownloadURL: getCSPDriverDownloadURL,
};