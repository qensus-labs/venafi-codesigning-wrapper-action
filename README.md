# Venafi Codesigning Wrapper Github Action
This action enables you to download, cache and set the Venafi CodeSign Protect clients either based on `Venafi CSP` or `PKCS#11`.
Optionally you may want to set a `default configuration` for verification purposes.

if you are not familiar with `Code Signing` or `Venafi CodeSign Protect`, please refer to current [CodeSign Protect documentation](https://docs.venafi.com/Docs/current/TopNav/Content/CodeSigning/cco-codesigning-understanding.php) to get an understanding of the benefits and product features.

**Table of contents**

 - [Usage overview](#usage-overview)
 - [Optional Inputs](#optional-inputs)
 - [Expected Outputs](#expected-outputs)
 - [Compatibility](#compatibility)
 - [Usage](#usage)
   - [Example including initial configuration](#example-including-initial-configuration)
   - [Example using minimal configuration](#example-using-minimal-configuration)
   - [Example running on a self-hosted Linux](#example-running-on-a-self-hosted-linux-runner-with-jarsigner)
   - [Example running on a self-hosted Windows](#example-running-on-a-self-hosted-windows-runner-with-signtool)
 - [Contribution & development](#contribution-development)


## Usage overview
This action currently supports GitHub-provided Linux and Windows runners, including self-hosted runners.
Currently we provide examples for `jarsigner` and `signtool`, which are provided through the Python library [Venafi CodeSign Protect: Python (PyPi) Package](https://pypi.org/project/venafi-csp/).

### Optional Inputs
The following optional inputs:

| Input | Description |
| --- | --- |
| `tpp-csc-url` | Venafi CodeSign Protect client Download page, which defaults to `https://localhost/csc` for local development. |
| `tpp-version` | Venafi CodeSign Protect version, which defaults to `24.1.0`, our latest tested version. |
| `tpp-auth-url` | Trust Protection Platform authentication server URL, which defaults to `https://localhost/vedauth` for local development. |
| `tpp-hsm-url` | Trust Protection Platform virtual HSM URL, which defaults to `https://localhost/vedhsm` for local development. |
| `include-config` | Does an initial `set-url` to set the authentication server and virtual HSM URLs, which defaults to `false` for local development. |
| `tpp-user` | The login `username` that has privileges to properly execute `signing` operations, which defaults to `signer` and can be overwritten when needed. |
| `tpp-password` | The `password` associated with the login username. The latter is useful for storing the password in a Github Secret, which can be accessed through a variable. |

*Note: Don't forget to register the `password` as **Github Secret**.*

## Expected Outputs
The following outputs:

| Output | Description |
| --- | --- |
| `csp-driver-cached-config` | Configuration of the cached CSP Driver package. Only if `initial-config` is set to `true`. |
| `csp-driver-cached-path` | Path of the cached CSP Driver package. |
| `csp-driver-cached-version` | Version of the cached CSP Driver package. |

Add the following entry to your Github workflow YAML file as bare minimum input.:

```yaml
uses: qensus-labs/venafi-codesigning-wrapper-action@v1.0.0
with:
  version: '24.1.0' # optional
```
## Compatibility

This product is compatible with:

 * Trust Protection Platform 24.1 or later.
 * Venafi CodeSign Protect client tools 24.1 or later.

This product supports executing code signing clients in a Shell environment using the Python `venafi-csp` integration. We currently support Linux and Windows operating systems.

Currently our support differs per OS:

| Signer    | OS      | Venafi-CSP |
|-----------|---------|------------|
| Jarsigner | Linux   |     ✅     |
| Jarsigner | Windows |     ✅     |
| Signtool  | Linux   |     ❌     |
| Signtool  | Windows |     ✅     |

## Usage

Below example usage examples you may want to implement using Github Actions `shared` or `self-hosted` runners.

### Example including initial configuration:

Scenario implements a `pinned` version that includes an initial configuration.

```yaml
jobs:
  example:
    runs-on: ubuntu-latest

    permissions: {}

    name: Example including initial configuration
    steps:
      - name: Setup CSPDriver
        uses: qensus-labs/venafi-codesigning-wrapper-action@v1.0.0
        with:
          tpp-version: '24.1.0'
          tpp-csc-url: 'https://my-tpp/csc'
          tpp-auth-url: 'https://my-tpp/vedauth'
          tpp-hsm-url: 'https://my-tpp/vedhsm'
          include-config: 'true'
          tpp-user: 'signer'
      - name: Check CSPDriver (version)
        run: pkcs11config --version
```

### Example using minimal configuration:

Scenario implements the `default` version with minimal configuration. It does require a local development environment (TPP).


```yaml
jobs:
  example:
    runs-on: ubuntu-latest

    permissions: {}

    name: Example with local TPP
    steps:
      - name: Setup CSPDriver
        uses: qensus-labs/venafi-codesigning-wrapper-action@v1.0.0
      - name: Check CSPDriver (version)
        run: pkcs11config --version
```

### Example running on a self-hosted Linux runner with jarsigner:

Complete implements a `pinned` version that includes an initial configuration. Additionally it demostrated the complete code signing lifecycle using `jarsigner`.

```yaml
jobs:
  example:
    runs-on: ["self-hosted", "Linux", "X64"]
    name: Example with self-hosted Linux runner
    steps:
      - name: Setup CSPDriver
        id: cspdriver
        uses: qensus-labs/venafi-codesigning-wrapper-action@v1.0.0
        with:
          tpp-version: '24.1.0'
          tpp-csc-url: 'https://my-tpp/csc'
          tpp-auth-url: 'https://my-tpp/vedauth'
          tpp-hsm-url: 'https://my-tpp/vedhsm'
          include-config: 'true'
      - name: Display output values
        run: |
          echo "Output \"csp-driver-cached-config\" [${{steps.cspdriver.outputs.csp-driver-cached-config}}]"
          echo "Output \"csp-driver-cached-path\" [${{steps.cspdriver.outputs.csp-driver-cached-path}}]"
          echo "Output \"csp-driver-cached-version\" [${{steps.cspdriver.outputs.csp-driver-cached-version}}]"
      - name: Check CSPDriver (version)
        run: pkcs11config --version
      - name: Setup Java SDK
        uses: actions/setup-java@v4
        with:
          distribution: 'oracle' # See 'Supported distributions' for available options
          java-version: '21'
      - name: Show JarSigner version
        run: jarsigner -version
      - name: Build foo.jar
        run: |
          echo 'public class Foo { public static void main() { } }' > Foo.java
          javac Foo.java
          jar -cf foo.jar Foo.class
      - name: Store the foo.jar artifact
        uses: actions/upload-artifact@v3
        with:
          name: foo.jar
          path: foo.jar
      - name: Setup Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      - name: Install Venafi Python package
        run: pip install venafi-csp
      - name: Run Library command
        run: python -mvenafi_csp.version_command
      - name: Sign artifact with JarSigner
        run: python -mvenafi_csp.jarsigner_sign_command
        env:
          TPP_AUTH_URL: 'https://my-tpp/vedauth'
          TPP_HSM_URL: 'https://my-tpp/vedhsm'
          TPP_USERNAME: signer
          TPP_PASSWORD: ${{ secrets.TPP_PASSWORD }}
          VENAFI_CLIENT_TOOLS_DIR: '${{ runner.tool_cache }}/CSPDriver/24.1.0/x64/opt/venafi/codesign'
          INPUT_PATH: foo.jar
          CERTIFICATE_LABEL: github-signer-development-codesigner
```

### Example running on a self-hosted Windows runner with signtool:

Scenario implements a `pinned` version that includes an initial configuration. Additionally it demostrated the complete code signing lifecycle using `signtool`.

```yaml
jobs:
  example_job:
    # runs-on: ubuntu-latest
    runs-on: ["self-hosted", "Windows", "X64" ]
    name: Example with self-hosted Windows runner
    steps:
      - name: Setup CSPDriver
        id: cspdriver
        uses: qensus-labs/venafi-codesigning-wrapper-action@v1.0.0
        with:
          tpp-version: '24.1.0'
          tpp-csc-url: 'https://my-tpp/csc'
          tpp-auth-url: 'https://my-tpp/vedauth'
          tpp-hsm-url: 'https://my-tpp/vedhsm'
          include-config: 'true'
      - name: Display output values
        run: |
          echo "Output \"csp-driver-cached-config\" [${{steps.cspdriver.outputs.csp-driver-cached-config}}]"
          echo "Output \"csp-driver-cached-path\" [${{steps.cspdriver.outputs.csp-driver-cached-path}}]"
          echo "Output \"csp-driver-cached-version\" [${{steps.cspdriver.outputs.csp-driver-cached-version}}]"
      - name: Check CSPDriver (version)
        run: cspconfig.exe version
```

## Contribution & development

See the [contribution guide](CONTRIBUTING.md).