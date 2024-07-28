const fs = require("fs");
const util = require("util");
const path = require("path");
const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");

// Variable from Github to asign.
const tempDir = process.env['RUNNER_TEMP'];

// The name of the tool we are installing with this action, which is 'Venafi Code Sign Protect'
const toolName = "Venafi_CSP";

// The architecture of the system to install the package on. Most scenarios 'intel' is applicable.
const architecture = core.getInput('architecture');

// Base form of the the URL to download the release archives. As long as this
// does not change this will be able to download any version the CLI.
const baseURL = core.getInput('tpp-csc-url') + '/clients';

const authURL = core.getInput('tpp-auth-url');

const hsmURL = core.getInput('tpp-hsm-url');

async function createFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
  } catch (exception) {
    throw new Error(
      util.format("Failed to write contents to", filePath),
      core.error(`The following exception occured: ${exception}`)
    );
  }
}

function extractSemver(version) {
  var [major, minor] = version.split('.');
  var semver = major + "." + minor;
  return semver;
}

async function uninstallCSPDriver(currentOs, currentDistro, currentFamily, installId) {
  const executeCommand = async (command, args) => {
    const { exitCode, stdout, stderr } = await exec.getExecOutput(command, args, {
      silent: true,
      ignoreReturnCode: true
    });
    core.debug(`removal: exitcode[${exitCode}] with stdout: ${stdout} ${stderr ? `stderr: ${stderr}` : ''}`);
  };

  if (currentOs === 'Linux') {
    if (currentFamily === 'debian') {
      await executeCommand('sudo', ['apt', 'remove', installId, '-y']);
    } else if (currentFamily === 'redhat') {
      await executeCommand('sudo', ['yum', 'remove', installId, '-y']);
    }
  } else if (currentOs === 'Windows_NT' && currentDistro === 'default') {
    await executeCommand('msiexec', ['/qn', '/x', installId]);
  } else if (currentOs === 'Darwin' && currentDistro === 'default') {
    // Requires some work
  } else {
    console.log('Unsupported operating system or distribution detected');
  }
}

// Function to check currentBase of the installation and if needed trigger a reinstall
async function checkCSPDriverSetup(currentOs, currentDistro, currentFamily, version) {
  const semver = extractSemver(version);
  let localSemver = "";
  let reinstall = true;
  let installId = "venaficodesign";

  const checkInstall = async (command, args) => {
    const { exitCode, stdout, stderr } = await exec.getExecOutput(command, args, {
      silent: true,
      ignoreReturnCode: true
    });
    core.debug(`ExitCode: ${exitCode} StdOut: ${stdout} ${stderr ? `ErrOut: ${stderr}` : ''}`);
    return { exitCode, stdout };
  };

  const parseVersion = (stdout, key) => {
    const lines = stdout.trim().split('\n');
    lines.forEach(item => {
      const [k, ...vParts] = item.toLowerCase().trim().split(':');
      const value = vParts.join(':').trim();
      if (k.trim() === key) {
        core.info(`Detected CSP Driver installation version ${value}`);
        localSemver = extractSemver(value);
      }
    });
  };

  if (currentOs === 'Linux') {
    const commandArgs = currentFamily === 'debian' 
      ? ['apt', 'show', installId] 
      : currentFamily === 'redhat' 
      ? ['yum', 'info', installId] 
      : null;

    if (commandArgs) {
      const { exitCode, stdout } = await checkInstall('sudo', commandArgs);
      if (exitCode === 0) {
        parseVersion(stdout, 'version');
        if (localSemver.match(semver)) {
          core.info(`Matched CSP Driver semantic version ${localSemver}`);
          reinstall = false;
        }
      } else {
        core.info(`Detected no CSP Driver installation`);
      }
    }
  } else if (currentOs === 'Windows_NT' && currentDistro === 'default') {
    const script = `
      Get-ChildItem -Path HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ |
      Get-ItemProperty | Select-Object DisplayName, DisplayVersion, UninstallString |
      Where-Object {($_.DisplayName -like "*Venafi*Code*Signing*")} | Format-List
    `;
    core.debug(`content: ${script}`);
    await createFile(`${tempDir}\\venafi-csp-check-install.ps1`, script);
    const { exitCode, stdout } = await checkInstall('powershell', [
      "-File",
      `${tempDir}\\venafi-csp-check-install.ps1`
    ]);
    if (exitCode === 0) {
      parseVersion(stdout, 'displayversion');
      if (localSemver.match(semver)) {
        core.info(`Matched CSP Driver semantic version ${localSemver}`);
        reinstall = false;
      }
      const match = stdout.match(/\{[0-9A-Fa-f\-]+\}/);
      if (match) installId = match[0];
    }
  } else if (currentOs === 'Darwin' && currentDistro === 'default') {
    // Requires some work
  } else {
    console.log('Unsupported operating system or distribution detected');
  }

  core.debug(`reinstall: ${reinstall}`);
  return { reinstall, installId };
}


// Supported family is debian or redhat based.
async function installCSPDriverPackage(cachedToolPath, packageName, currentOs, currentDistro, currentFamily) {
  var packageInstaller;
  var result = "";
  const options = {
    listeners: {
      stdout: (data) => { result += data.toString() }
    }
  }

  if (currentOs == 'Linux' && currentFamily == 'debian' ) {
    packageInstaller = 'dpkg'
    await exec.exec('sudo', [packageInstaller, '-i', util.format("%s/%s",cachedToolPath, packageName) ], options );
  }
  else if (currentOs == 'Linux' && currentFamily == 'redhat' ) {
    packageInstaller = 'rpm'
    await exec.exec('sudo', [packageInstaller, '-Uvh', util.format("%s/%s",cachedToolPath, packageName) ], options );
  }
  else if (currentOs == 'Windows_NT' && currentDistro == 'default') {
    // start /wait msiexec /qn /i "VenafiCodeSigningClients-24.1.0-x64.msi"
    packageInstaller = 'msiexec'
    await exec.exec('powershell', ['Start-Process','-FilePath', util.format("%s\\%s",cachedToolPath, packageName), '-Wait'  ], options );
    // await exec.exec('powershell', ['Start-Process', '-FilePath', packageInstaller,'-ArgumentList',"'/qn", '/i', util.format("%s\\%s'",cachedToolPath, packageName), '-Wait' ], options );
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
// Supported family is debian or redhat based.
function getCSPDriverDownloadInfo(baseURL, currentOs, currentDistro, currentFamily, version) {
  var url = "";
  var file = "";
  if (currentOs == 'Linux' && currentFamily == 'debian' && architecture == 'intel') {
    file = `venafi-csc-latest-x86_64.deb`;
  }
  else if (currentOs == 'Linux' && currentFamily == 'debian' && architecture == 'arm') {
    file = `venafi-csc-latest-aarch64.deb`;
  }
  else if (currentOs == 'Linux' && currentFamily == 'redhat' && architecture == 'intel') {
    file = `venafi-csc-latest-x86_64.rpm`;
  }
  else if (currentOs == 'Linux' && currentFamily == 'redhat' && architecture == 'arm') {
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
  var setupfile = file.replace('latest', version);

  if (currentOs == 'Windows_NT') {
     setupfile = setupfile.replace('.msi', '.bat');
  }

  return {
    url: url,
    savefile: savefile,
    setupfile:setupfile
  }
}

// Downloads and installs the package to the runner and returns the path.
async function downloadCSPDriver(baseURL, currentOs, currentDistro, currentFamily, version) {
  // Do we have the package installed and which version?
  // Do we need to replace or skip
  const { reinstall, installId }  = await checkCSPDriverSetup(currentOs, currentDistro, currentFamily, version);
  core.debug(`reinstall: ${reinstall}`);
  
  if (reinstall) {
    await uninstallCSPDriver(currentOs, currentDistro, currentFamily, installId);
  }

  // Generate all information for the CSPDriver Download specification
  const download = getCSPDriverDownloadInfo(baseURL,currentOs,currentDistro, currentFamily, version);

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

    if (currentOs == 'Windows_NT') {
      core.debug(`Setup initialized using batch file`);
      var package = util.format("%s\\%s",cachedToolPath, download.savefile);
      core.debug(`package: ${package}`);
      const content = `
      msiexec /qn /i "${package}"
      `
      core.debug(`content: ${content}`);
      createFile(util.format("%s/%s",cachedToolPath, download.setupfile), content);
    }

    core.debug(`cacheDir: ${cachedToolPath}`);
  }
  
  // Now that we have the install package let's installl this for the currentOs + distribution
  if (reinstall) {
    var setupPackage = await installCSPDriverPackage(cachedToolPath, download.setupfile, currentOs, currentDistro, currentFamily);
    core.debug(`Installation results: ${setupPackage}`);
  }

  const toolPath = findTool(cachedToolPath, download.setupfile);
  core.debug(`toolPath: ${toolPath}`);
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
async function run(currentOs, currentDistro, currentFamily, version) {
  core.info(`Identified '${currentDistro}' for ${currentFamily} ${currentOs}`);
  
  let cachedPath = await downloadCSPDriver(baseURL, currentOs, currentDistro, currentFamily, version);

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