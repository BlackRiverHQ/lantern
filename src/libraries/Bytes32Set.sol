// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Bytes32Set
/// @notice Minimal enumerable set. Used for seen payload hashes and priced rounds.
library Bytes32Set {
    struct Set {
        bytes32[] values;
        mapping(bytes32 => uint256) index; // 1-based; 0 means absent
    }

    function add(Set storage self, bytes32 value) internal returns (bool) {
        if (self.index[value] != 0) return false;
        self.values.push(value);
        self.index[value] = self.values.length;
        return true;
    }

    function remove(Set storage self, bytes32 value) internal returns (bool) {
        uint256 idx = self.index[value];
        if (idx == 0) return false;
        uint256 last = self.values.length;
        if (idx != last) {
            bytes32 moved = self.values[last - 1];
            self.values[idx - 1] = moved;
            self.index[moved] = idx;
        }
        self.values.pop();
        delete self.index[value];
        return true;
    }

    function contains(Set storage self, bytes32 value) internal view returns (bool) {
        return self.index[value] != 0;
    }

    function length(Set storage self) internal view returns (uint256) {
        return self.values.length;
    }

    function at(Set storage self, uint256 i) internal view returns (bytes32) {
        return self.values[i];
    }
}
