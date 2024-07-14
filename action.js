const fs = require("fs");
const util = require("util");
const path = require("path");
const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");

// The name of the tool we are installing with this action, which is 'Venafi Code Sign Protect'
const toolName = "Venafi_CSP";

// The architecture of the system to install the package on. Most scenarios 'intel' is applicable.
const architecture = core.getInput('architecture');

// Base form of the the URL to download the release archives. As long as this
// does not change this will be able to download any version the CLI.
const baseURL = core.getInput('tpp-csc-url') + '/clients';

const authURL = core.getInput('tpp-auth-url');

const hsmURL = core.getInput('tpp-hsm-url');

//
async function checkCSPDriverSetup(currentOs, currentDistro, version) {
  const debDistrolist = ['ubuntu', 'debian'];
  const rhelDistrolist = ['rhel', 'centos', 'rocky', 'amzn', 'fedora', 'ol'];
  var packageInfo = "";
  const options = {
    listeners: {
      stdout: (data) => { packageInfo += data.toString() }
    }
  }

  if (currentOs == 'Linux' && debDistrolist.includes(currentDistro)) {
    await exec.exec('sudo', ['apt', 'show', 'venaficodesign'], options );
  }
  else if (currentOs == 'Linux' && rhelDistrolist.includes(currentDistro)) {
    await exec.exec('sudo', ['yum', 'info', 'venaficodesign'], options );
  }
  else if (currentOs == 'Windows_NT' && currentDistro == 'default') {
    // Requires some work
  }
  else if (currentOs == 'Darwin' && currentDistro == 'default') {
    // Requires some work
  }
  else {
    console.log('Unsupported operating system or distribution detected');
  }
  return packageInfo;
}



// Supported distro names are 'rhel','centos', 'rocky', 'ubuntu', 'amzn', 'fedora', 'debian' and 'ol'.
async function installCSPDriverPackage(cachedToolPath, packageName, currentOs, currentDistro) {
  const debDistrolist = ['ubuntu', 'debian'];
  const rhelDistrolist = ['rhel', 'centos', 'rocky', 'amzn', 'fedora', 'ol'];
  var packageInstaller;
  var result = "";
  const options = {
    listeners: {
      stdout: (data) => { result += data.toString() }
    }
  }

  if (currentOs == 'Linux' && debDistrolist.includes(currentDistro)) {
    packageInstaller = 'dpkg'
    await exec.exec('sudo', [packageInstaller, '-i', util.format("%s/%s",cachedToolPath, packageName) ], options );
  }
  else if (currentOs == 'Linux' && rhelDistrolist.includes(currentDistro)) {
    packageInstaller = 'rpm'
    await exec.exec('sudo', [packageInstaller, '-Uvh', util.format("%s/%s",cachedToolPath, packageName) ], options );
  }
  else if (currentOs == 'Windows_NT' && currentDistro == 'default') {
    // start /wait msiexec /qn /i "VenafiCodeSigningClients-24.1.0-x64.msi"
    packageInstaller = 'msiexec'
    await exec.exec('start', ['/wait', packageInstaller, '/qn', '/i', util.format("%s/%s",cachedToolPath, packageName) ], options );
  }
  else if (currentOs == 'Darwin' && currentDistro == 'default') {
    // mkdir -p installer
    // sudo hdiutil attach "Venafi CodeSign Protect Clients v24.1.0-universal.dmg" -noautoopen -mountpoint installer/
    // sudo installer -pkg "installer/Venafi CodeSign Protect Clients.pkg/" -target /
    // sudo hdiutil detach installer
    packageInstaller = 'installer'
    await exec.exec('sudo', [packageInstaller, '-pkg', '"installer/Venafi CodeSign Protect Clients.pkg/"', '-target', '/' ], options );
  }
  else {
    console.log('Unsupported operating system or distribution detected');
  }
  return result;
}

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


// Returns an object with the URL and savefile used to download a specific version of the CSP Driver (either PKCS11 for Linux or CSP for Windows) for a
// specific operating system, distribution and architecture. 
// Supported distro names are 'rhel','centos', 'rocky', 'ubuntu', 'amzn', 'fedora', 'debian' and 'ol'.
function getCSPDriverDownloadInfo(baseURL, currentOs, currentDistro, version) {
  var url = "";
  var file = "";
  const debDistrolist = ['ubuntu', 'debian'];
  const rhelDistrolist = ['rhel', 'centos', 'rocky', 'amzn', 'fedora', 'ol'];
  if (currentOs == 'Linux' && debDistrolist.includes(currentDistro) && architecture == 'intel') {
    file = `venafi-csc-latest-x86_64.deb`;
  }
  else if (currentOs == 'Linux' && debDistrolist.includes(currentDistro) && architecture == 'arm') {
    file = `venafi-csc-latest-aarch64.deb`;
  }
  else if (currentOs == 'Linux' && rhelDistrolist.includes(currentDistro) && architecture == 'intel') {
    file = `venafi-csc-latest-x86_64.rpm`;
  }
  else if (currentOs == 'Linux' && rhelDistrolist.includes(currentDistro) && architecture == 'arm') {
    file = `venafi-csc-latest-aarch64.rpm`;
  }   
  else if (currentOs == 'Windows_NT' && currentDistro == 'default' && architecture == 'intel') {
    file = `venafi-csc-latest-x86_64.msi`;
  }
  else if (currentOs == 'Darwin' && currentDistro == 'default' && architecture == 'intel') {
    file = `venafi-csc-latest-universal.dmg`;
  }
  else {
    console.log('Unsupported operating system or distribution detected');
  }
  url = util.format("%s/%s", baseURL, file);
  var savefile = file.replace('latest', version);
  return {
    url: url,
    savefile: savefile
  }
}

// Downloads and installs the package to the runner and returns the path.
async function downloadCSPDriver(baseURL, currentOs, currentDistro, version) {

  // Do we have the package installed and which version?
  // Do we need to replace or skip
  const packageInfo = checkCSPDriverSetup(currentOs, currentDistro, version);
  core.debug(`PackageInfo: ${packageInfo}`)

  // Generate all information for the CSPDriver Download specification
  const download = getCSPDriverDownloadInfo(baseURL,currentOs,currentDistro, version);

  // See if we have cached this tool already
  let cachedToolPath = tc.find(toolName, version);
  core.debug(`find: ${cachedToolPath}`)

  // If we did not find the tool in the cache download it now.
  if (!cachedToolPath) {
    let downloadPath;
    try {
      core.info(`Downloading CSP Driver from ${download.url}...`);
      downloadPath = await tc.downloadTool(download.url, download.savefile);
      core.debug(`downloadTool: ${downloadPath}`);
    } catch (exception) {
      throw new Error(
        util.format("Failed to download CSPDriver from location", download.url),
        core.error(`The following axception occured: ${exception}`)
      );
    }
    // (chmod a+rwx) sets permissions so that, User / owner can read, can
    // write and can execute. Group can read, can write and can execute.
    // Others can read, can write and can execute.
    fs.chmodSync(downloadPath, "777");

    // Cache the downloaded installationfile to the tool-cache folder.
    cachedToolPath = await tc.cacheFile(downloadPath, download.savefile, toolName, version);
    if (!cachedToolPath) {
      throw new Error(
        util.format("CSP Driver package cannot be cached", cachedToolPath)
      );
    }
    else {
      fs.rmSync(downloadPath);
    }

    core.debug(`cacheDir: ${cachedToolPath}`);
  }
  
  // Now that we have the install package let's installl this for the currentOs + distribution
  var setupPackage = await installCSPDriverPackage(cachedToolPath, download.savefile, currentOs, currentDistro);
  core.debug(`Installation results: ${setupPackage}`);

  // Get the full path to the executable
  const toolPath = findTool(currentOs, cachedToolPath, download.savefile);
  if (!toolPath) {
    throw new Error(
      util.format("CSP Driver package not found in path", cachedToolPath)
    );
  }

  core.info(`CSP Driver installed to ${toolPath}...`);

  // (chmod a+rwx) sets permissions so that, User / owner can read, can
  // write and can execute. Group can read, can write and can execute.
  // Others can read and can execute.
  fs.chmodSync(toolPath, "775");

  return toolPath;
}

// Returns a install path of the desired tool
function findTool(rootFolder, packageName) {
  core.info(`Discovery started for ${packageName} ${rootFolder}`);
  // Holds all the paths. The tool might be installed in multiple locations.
  var fileList;

  // walkSync is recursive which is why we pass in fileList and assign it the
  // return value of this function.
  fileList = walkSync(
    rootFolder,
    fileList,
    packageName
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
async function run(currentOs, currentDistro, version) {
  core.info(`Identified '${currentDistro}' for ${currentOs}`);
  
  let cachedPath = await downloadCSPDriver(baseURL, currentOs, currentDistro, version);

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
  getCSPDriverDownloadInfo: getCSPDriverDownloadInfo,
};