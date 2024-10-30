import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Test creating a new agreement
Clarinet.test({
    name: "Ensure that vendor can create a new agreement",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const vendor = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const amount = 1000;

        let block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'create-agreement',
                [
                    types.principal(buyer.address),
                    types.uint(amount),
                    types.utf8("Test agreement")
                ],
                vendor.address
            )
        ]);
        
        // Assert successful creation
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), '1'); // First agreement ID
        assertEquals(block.height, 2);
    },
});

// Test funding an agreement
Clarinet.test({
    name: "Ensure that buyer can fund an existing agreement",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const vendor = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const amount = 1000;

        // First create an agreement
        let block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'create-agreement',
                [
                    types.principal(buyer.address),
                    types.uint(amount),
                    types.utf8("Test agreement")
                ],
                vendor.address
            )
        ]);

        // Then fund it
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'fund-agreement',
                [types.uint(1)], // Agreement ID 1
                buyer.address
            )
        ]);
        
        // Assert successful funding
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), 'true');
    },
});

// Test accepting an agreement
Clarinet.test({
    name: "Ensure that buyer can accept a funded agreement",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const vendor = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const amount = 1000;

        // Create and fund agreement
        let block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'create-agreement',
                [
                    types.principal(buyer.address),
                    types.uint(amount),
                    types.utf8("Test agreement")
                ],
                vendor.address
            ),
            Tx.contractCall(
                'bridgarr',
                'fund-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);

        // Accept the agreement
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'accept-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);
        
        // Assert successful acceptance
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), 'true');
    },
});

// Test completing an agreement
Clarinet.test({
    name: "Ensure that buyer can complete an accepted agreement",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const vendor = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const amount = 1000;

        // Setup: Create, fund, and accept agreement
        let block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'create-agreement',
                [
                    types.principal(buyer.address),
                    types.uint(amount),
                    types.utf8("Test agreement")
                ],
                vendor.address
            ),
            Tx.contractCall(
                'bridgarr',
                'fund-agreement',
                [types.uint(1)],
                buyer.address
            ),
            Tx.contractCall(
                'bridgarr',
                'accept-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);

        // Complete the agreement
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'complete-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);
        
        // Assert successful completion and fund transfer
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), 'true');
    },
});

// Test dispute flow
Clarinet.test({
    name: "Ensure dispute and refund flow works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const vendor = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const contractOwner = accounts.get('deployer')!;
        const amount = 1000;

        // Setup: Create, fund, and accept agreement
        let block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'create-agreement',
                [
                    types.principal(buyer.address),
                    types.uint(amount),
                    types.utf8("Test agreement")
                ],
                vendor.address
            ),
            Tx.contractCall(
                'bridgarr',
                'fund-agreement',
                [types.uint(1)],
                buyer.address
            ),
            Tx.contractCall(
                'bridgarr',
                'accept-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);

        // Dispute the agreement
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'dispute-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);
        
        // Assert successful dispute
        assertEquals(block.receipts[0].result.expectOk(), 'true');

        // Refund the agreement
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'refund-agreement',
                [types.uint(1)],
                contractOwner.address
            )
        ]);
        
        // Assert successful refund
        assertEquals(block.receipts[0].result.expectOk(), 'true');
    },
});

// Test error cases
Clarinet.test({
    name: "Ensure proper error handling",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const vendor = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const unauthorizedUser = accounts.get('wallet_3')!;
        const amount = 1000;

        // Try to fund non-existent agreement
        let block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'fund-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);
        
        // Assert error for non-existent agreement
        assertEquals(block.receipts[0].result.expectErr(), 'u104'); // ERR-NOT-FOUND

        // Create agreement
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'create-agreement',
                [
                    types.principal(buyer.address),
                    types.uint(amount),
                    types.utf8("Test agreement")
                ],
                vendor.address
            )
        ]);

        // Try to accept unfunded agreement
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'accept-agreement',
                [types.uint(1)],
                buyer.address
            )
        ]);
        
        // Assert error for invalid status
        assertEquals(block.receipts[0].result.expectErr(), 'u102'); // ERR-INVALID-STATUS

        // Try unauthorized access
        block = chain.mineBlock([
            Tx.contractCall(
                'bridgarr',
                'fund-agreement',
                [types.uint(1)],
                unauthorizedUser.address
            )
        ]);
        
        // Assert error for unauthorized access
        assertEquals(block.receipts[0].result.expectErr(), 'u100'); // ERR-NOT-AUTHORIZED
    },
});