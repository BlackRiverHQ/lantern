# Everything a reviewer needs, in the order they would need it.
.PHONY: build test fast invariants gas sizes fmt clean deploy demo

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

fmt:
	forge fmt

clean:
	forge clean

deploy:
	forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

demo:
	forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
