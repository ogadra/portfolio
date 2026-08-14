{
  description = "ogadra.com portfolio dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    hk = {
      url = "github:jdx/hk/v1.49.0";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
    };
  };

  outputs = { self, nixpkgs, flake-utils, hk }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # nixpkgs carries the browser set for exactly one Playwright release, so
        # @playwright/test is pinned to that same version. Bump one without the
        # other and `playwright test` goes looking for a browser revision that
        # is not in the store, so fail here with something readable instead.
        playwrightVersion = builtins.replaceStrings [ "^" "~" ] [ "" "" ]
          (builtins.fromJSON (builtins.readFile ./package.json)).devDependencies."@playwright/test";
        browsers = pkgs.lib.throwIf
          (pkgs.playwright-driver.version != playwrightVersion)
          ("package.json pins playwright ${playwrightVersion} but nixpkgs has "
            + "${pkgs.playwright-driver.version}; run `nix flake update nixpkgs` "
            + "or match the npm version to nixpkgs")
          pkgs.playwright-driver.browsers;
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_26
            pkgs.pnpm
            pkgs.wrangler
            pkgs.git
            pkgs.curl
            browsers
            hk.packages.${system}.default
          ];

          PLAYWRIGHT_BROWSERS_PATH = "${browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";

          # workerd (astro dev / wrangler dev) needs an explicit CA bundle for outbound TLS
          SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
        };
      });
}
