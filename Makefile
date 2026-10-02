# Common commands.

.PHONY: build test invariants fmt clean deploy-dry

build:
	forge build

test:
	forge test --no-match-path "test/invariants/*"

invariants:
	forge test --match-path "test/invariants/*"

fmt:
	forge fmt

clean:
	forge clean

# Dry run against the named testnet endpoint. Add --broadcast to send.
deploy-dry:
	forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia -vv
