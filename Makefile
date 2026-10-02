# Everything a reviewer needs, in the order they would need it.
.PHONY: build test fast invariants gas sizes fmt clean deploy demo report challenge redeploy redeploy-account verify-source rehearse coverage

build:
	forge build

test:
	forge test

fast:
	forge test --no-match-path "test/invariants/*"

invariants:
	forge test --match-path "test/invariants/*"

gas:
	forge test --match-path "test/gas/*" --gas-report

sizes:
	forge build --sizes

# Coverage counters inflate gas, so the gas suite is excluded rather than allowed to fail
# here for a reason that has nothing to do with the code changing.
coverage:
	forge coverage --report lcov --no-match-contract "GasTest|LanternInvariantsTest"
	@echo "lcov.info written"

fmt:
	forge fmt

clean:
	forge clean

deploy:
	forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

demo:
	forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

# Needs LANTERN and MARKET from the deploy, or run `make redeploy` instead.
report:
	forge script script/ReportFromChainlink.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

challenge:
	forge script script/ChallengeWithChainlink.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

# Where the seized collateral ends up: the market's claim, run after a verdict or after the window.
settle:
	forge script script/DemoSettle.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

# The whole sequence in one order, against the addresses the deploy just made, then the record
# rewritten from the broadcast. Refuses to run the demo against a deploy that did not land.
redeploy:
	./script/redeploy.sh

# The same sequence with the key read from the account file, so it never has to be exported by hand
# and never appears in a shell history, a transcript, or this file. The file is created once, outside
# the repository, by: cast wallet new --json > ~/.lantern-deployer.json && chmod 600 it.
ACCOUNT_FILE ?= $(HOME)/.lantern-deployer.json
redeploy-account:
	ACCOUNT_FILE="$(ACCOUNT_FILE)" ./script/with-account.sh ./script/redeploy.sh

verify-source:
	./script/verify-source.sh all

# Prove the whole sequence on a fork of the live chain, for free, before paying for it.
rehearse:
	./script/rehearse-fork.sh
