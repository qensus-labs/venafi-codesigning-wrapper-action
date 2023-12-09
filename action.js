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

// Returns the distro name of the linux operating system.
// Supported distro names are 'rhel','centos', 'rocky', 'ubuntu', 'amzn', 'fedora', 'debian' and 'ol'.
function getLinuxDistroID() {
  fs.readFile('/etc/os-release', 'utf8', (err, data) => {
    if (err) throw err
    const lines = data.split('\n')
    const distroRelease = {}
    console.log(`== ${lines}`);
    lines.forEach((line) => {
      // Split the line into an array of words delimited by '='
      const words = line.split('=')
      distroRelease[words[0].trim().toLowerCase()] = words[1].trim()
    });
    console.log(`Distribution: ${distroRelease.id} detected.`);
    return distroRelease.id
  });
}

// Returns the URL used to download a specific version of the CSP Driver (either PKCS11 for Linux or CSP for Windows) for a
// specific platform.

function getCSPDriverFileName(currentOs, version) {
  var file = "";
  var distro = "";
  switch (currentOs) {
    case "Linux":
      distro = getLinuxDistroID();
      file = `venafi-csc-${version}-x86_64.rpm`;
      break;

    case "Darwin":
      file = `venafi-csc-${version}-x86_64.dmg`;
      break;

    case "Windows_NT":
    default:
      file = `venafi-csc-${version}-x86_64.msi`;
      break;
  }

  return file;
}

function getCSPDriverDownloadURL(file) {
  return util.format("%s/%s", baseURL, file);
}

// Downloads and installs the package to the runner and returns the path.
async function downloadCSPDriver(currentOs, version) {
  // See if we have cached this tool already
  let cachedToolPath = tc.find(toolName, version);

  // If we did not find the tool in the cache download it now.
  if (!cachedToolPath) {
    let downloadPath;
    var downloadFileName = getCSPDriverFileName(currentOs, version);
    let downloadUrl = getCSPDriverDownloadURL(downloadFileName);
    try {
      core.info(`Downloading CSP Driver from ${downloadUrl}...`);
      downloadPath = await tc.downloadTool(downloadUrl);
    } catch (exception) {
      throw new Error(
        util.format("Failed to download CSPDriver from location", downloadUrl)
      );
    }

    // Cache the downloaded tool so we do not have to download multiple times
    cachedToolPath = await tc.cacheFile(downloadPath, downloadFileName , toolName, version);
    downloadFileName = getCSPDriverFileName(currentOs, version);
  }

  // Get the full path to the executable
  const toolPath = findTool(currentOs, cachedToolPath, downloadFileName);
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
function findTool(currentOs, rootFolder, fileName) {
  fs.chmodSync(rootFolder, "777");

  // Holds all the paths. The tool might be installed in multiple locations.
  var fileList;

  // walkSync is recursive which is why we pass in fileList and assign it the
  // return value of this function.
  fileList = walkSync(
    rootFolder,
    fileList,
    fileName
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
function getExecutableExtension(currentOs) {
  switch (currentOs) {
    case "Linux":
      fileExtension = ".rpm";
      break;

    case "Darwin":
      fileExtension = ".dmg";
      break;

    case "Windows_NT":
    default:
      fileExtension = ".msi";
      break;
  }

  return fileExtension;
}

// Returns a list of path to the fileToFind in the dir provided.
function walkSync(dir, fileList, fileToFind) {
  core.info(`${dir} en ${fileToFind} en ${fileList}`);
  var files = fs.readdirSync(dir);

  fileList = fileList || [];
  files.forEach(function (file) {
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
  let cachedPath = await downloadCSPDriver(currentOs, version);

  if (!process.env["PATH"].startsWith(path.dirname(cachedPath))) {
    core.addPath(path.dirname(cachedPath));
  }

  console.log(
    `CSP Driver version: '${version}' has been cached at ${cachedPath}`
  );

  // set a an output of this action incase future steps need the path to the tool.
  core.setOutput("csp-driver-config", cachedPath);
}

module.exports = {
  run: run,
  downloadCSPDriver: downloadCSPDriver,
  getCSPDriverDownloadURL: getCSPDriverDownloadURL,
};