const os = require("os");
const fs = require("fs");
const action = require("./action");
const core = require("@actions/core");

/*
This function we determine the applicable distribution of the Linux operating system and sets the default distribution for other operating systems like Windows and MacOS.
*/
function getLinuxDistro(currentOs) {
  if (currentOs == 'Linux') {
    var distro; 
    const data = fs.readFileSync('/etc/os-release', 'utf8');
    const lines = data.toString().split('\n');
    const idLine = lines.find(line => line.startsWith('ID='));
    if (idLine) {
      distro = idLine.split('=')[1].replace(/^"(.*)"$/, '$1');
    }
  }
  else {
    distro = 'default';
  }
    return distro;
}

/*
This is how the action is used:

- uses: qensus-labs/venafi-codesigning-wrapper-action@v1
  with:
    version: '<version>' # default is 23.1
  id: install

*/
async function run() {
  try {
    // Get the users input of the with
    const version = core.getInput("tpp-version");
    core.info(`Installing CSP Driver version ${version}...`);

    // debug is only output if you set the secret `ACTIONS_RUNNER_DEBUG` to true
    core.debug(new Date().toTimeString());

    // determine current operating system used by github runner
    const currentOs = os.type();

    // determine current distro of the Linux operating system used by the github runner
    const currentDistro = getLinuxDistro(currentOs);

    // run the action code
    await action.run(currentOs, currentDistro, version);

    core.info(new Date().toTimeString());
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();