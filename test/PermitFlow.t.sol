// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/PerpFactory.sol";
import "../src/PerpEngine.sol";
import "../src/MockUSDC.sol";

/**
 * @title PermitFlowTest
 * @notice Tests EIP-2612 permit functionality for gasless approvals
 */
contract PermitFlowTest is Test {
    PerpFactory public factory;
    PerpEngine public engine;
    MockUSDC public usdc;

    // Test accounts with known private keys
    address public alice;
    uint256 public alicePrivateKey;
    address public bob;
    uint256 public bobPrivateKey;

    uint256 constant PRECISION = 1e18;
    uint256 constant MAX_UINT256 = type(uint256).max;

    function setUp() public {
        // Create test accounts
        alicePrivateKey = 0xA11CE;
        alice = vm.addr(alicePrivateKey);
        bobPrivateKey = 0xB0B;
        bob = vm.addr(bobPrivateKey);

        // Deploy implementation contracts
        PerpMarket perpMarketImpl = new PerpMarket();
        PositionManager positionManagerImpl = new PositionManager();
        PerpEngine perpEngineImpl = new PerpEngine();
        LiquidationEngine liquidationEngine = new LiquidationEngine();
        FundingManager fundingManager = new FundingManager();

        // Deploy factory
        factory = new PerpFactory(
            address(perpMarketImpl),
            address(positionManagerImpl),
            address(perpEngineImpl),
            liquidationEngine,
            fundingManager
        );

        // Deploy MockUSDC
        usdc = new MockUSDC();

        // Create market
        PerpFactory.MarketConfig memory config = PerpFactory.MarketConfig({
            baseReserve: 1_000_000 * 1e18,
            quoteReserve: 2_000_000_000 * 1e18,
            maxLeverage: 30 * 1e18
        });
        address engineAddr = factory.createMarket(address(usdc), config);
        engine = PerpEngine(engineAddr);

        // Give test users USDC
        usdc.mint(alice, 100_000 * 1e6);
        usdc.mint(bob, 100_000 * 1e6);
    }

    // ============ Helper Functions ============

    /**
     * @dev Generate EIP-2612 permit signature
     */
    function _generatePermitSignature(
        address owner,
        uint256 ownerPrivateKey,
        address spender,
        uint256 value,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 DOMAIN_SEPARATOR = usdc.DOMAIN_SEPARATOR();
        uint256 nonce = usdc.nonces(owner);

        bytes32 PERMIT_TYPEHASH = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );

        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline)
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        (v, r, s) = vm.sign(ownerPrivateKey, digest);
    }

    // ============ depositWithPermit Tests ============

    function test_DepositWithPermit_BasicFlow() public {
        uint256 depositAmount = 1000 * 1e6; // 1000 USDC
        uint256 deadline = block.timestamp + 1 hours;

        // Generate permit signature for exact amount
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            depositAmount,
            deadline
        );

        // Deposit using permit (no prior approval needed)
        vm.prank(alice);
        engine.depositWithPermit(depositAmount, depositAmount, deadline, v, r, s);

        // Verify balance
        assertEq(engine.getWalletBalance(alice), 1000 * PRECISION);
        assertEq(usdc.balanceOf(alice), 99_000 * 1e6);
    }

    function test_DepositWithPermit_UnlimitedApproval() public {
        uint256 deadline = block.timestamp + 1 hours;

        // Sign permit for UNLIMITED amount
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            MAX_UINT256,
            deadline
        );

        vm.startPrank(alice);

        // First deposit: 1000 USDC
        engine.depositWithPermit(1000 * 1e6, MAX_UINT256, deadline, v, r, s);
        assertEq(engine.getWalletBalance(alice), 1000 * PRECISION);

        // Advance nonce by making a regular transfer
        usdc.transfer(bob, 1);

        // Generate new signature with updated nonce
        (v, r, s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            MAX_UINT256,
            deadline
        );

        // Second deposit: 500 USDC with NEW signature (nonce changed)
        engine.depositWithPermit(500 * 1e6, MAX_UINT256, deadline, v, r, s);
        assertEq(engine.getWalletBalance(alice), 1500 * PRECISION);

        vm.stopPrank();
    }

    function test_DepositWithPermit_RevertsOnInvalidSignature() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 deadline = block.timestamp + 1 hours;

        // Generate signature for Alice
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            depositAmount,
            deadline
        );

        // Bob tries to use Alice's signature (should fail)
        vm.expectRevert();
        vm.prank(bob);
        engine.depositWithPermit(depositAmount, depositAmount, deadline, v, r, s);
    }

    function test_DepositWithPermit_RevertsOnExpiredDeadline() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 deadline = block.timestamp + 1 hours;

        // Generate signature
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            depositAmount,
            deadline
        );

        // Advance time past deadline
        vm.warp(deadline + 1);

        // Should revert
        vm.expectRevert();
        vm.prank(alice);
        engine.depositWithPermit(depositAmount, depositAmount, deadline, v, r, s);
    }

    function test_DepositWithPermit_RevertsOnZeroAmount() public {
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            1000 * 1e6,
            deadline
        );

        vm.expectRevert();
        vm.prank(alice);
        engine.depositWithPermit(0, 1000 * 1e6, deadline, v, r, s);
    }

    // ============ depositAndOpenPositionWithPermit Tests ============

    function test_DepositAndOpenPosition_GaslessOnboarding() public {
        uint256 depositAmount = 10_000 * 1e6; // 10,000 USDC
        uint256 deadline = block.timestamp + 1 hours;

        // Generate permit signature for unlimited
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            MAX_UINT256,
            deadline
        );

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        // Alice deposits and opens position in ONE transaction
        vm.prank(alice);
        uint256 positionId = engine.depositAndOpenPositionWithPermit(
            depositAmount,
            MAX_UINT256, // Signed for unlimited
            true, // Long
            1000 * PRECISION, // Use 1000 USDC
            10 * PRECISION, // 10x leverage
            deadline,
            v,
            r,
            s
        );

        // Verify position created
        assertEq(positionId, 1);

        // Verify USDC transferred
        assertEq(usdc.balanceOf(alice), aliceUsdcBefore - depositAmount);

        // Verify wallet balance (deposited 10k, used 1k for position)
        assertEq(engine.getWalletBalance(alice), 9000 * PRECISION);
    }

    function test_DepositAndOpenPosition_WithExactAmount() public {
        uint256 depositAmount = 5000 * 1e6;
        uint256 deadline = block.timestamp + 1 hours;

        // Sign for exact amount (not unlimited)
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            bob,
            bobPrivateKey,
            address(engine),
            depositAmount,
            deadline
        );

        // Open short position
        vm.prank(bob);
        uint256 positionId = engine.depositAndOpenPositionWithPermit(
            depositAmount,
            depositAmount, // Signed for exact amount
            false, // Short
            500 * PRECISION,
            5 * PRECISION, // 5x leverage
            deadline,
            v,
            r,
            s
        );

        assertEq(positionId, 1);
        assertEq(engine.getWalletBalance(bob), 4500 * PRECISION); // 5000 - 500
    }

    function test_DepositAndOpenPosition_RevertsOnInsufficientDeposit() public {
        uint256 depositAmount = 100 * 1e6; // Only 100 USDC
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            depositAmount,
            deadline
        );

        // Try to open position requiring 1000 USDC (should fail)
        vm.expectRevert();
        vm.prank(alice);
        engine.depositAndOpenPositionWithPermit(
            depositAmount,
            depositAmount,
            true,
            1000 * PRECISION, // More than deposited
            10 * PRECISION,
            deadline,
            v,
            r,
            s
        );
    }

    function test_DepositAndOpenPosition_RevertsOnExcessiveLeverage() public {
        uint256 depositAmount = 10_000 * 1e6;
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            depositAmount,
            deadline
        );

        // Try to open with > 30x leverage
        vm.expectRevert();
        vm.prank(alice);
        engine.depositAndOpenPositionWithPermit(
            depositAmount,
            depositAmount,
            true,
            1000 * PRECISION,
            31 * PRECISION, // > MAX_LEVERAGE
            deadline,
            v,
            r,
            s
        );
    }

    // ============ Edge Cases ============

    function test_PermitAmountCanBeLargerThanDeposit() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 permitAmount = 10_000 * 1e6; // Sign for more
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            permitAmount,
            deadline
        );

        // Deposit less than permitted amount
        vm.prank(alice);
        engine.depositWithPermit(depositAmount, permitAmount, deadline, v, r, s);

        assertEq(engine.getWalletBalance(alice), 1000 * PRECISION);

        // Remaining allowance can be used later
        uint256 remainingAllowance = usdc.allowance(alice, address(engine));
        assertEq(remainingAllowance, permitAmount - depositAmount);
    }

    function test_PermitNonceIncrementsCorrectly() public {
        uint256 deadline = block.timestamp + 1 hours;

        uint256 nonceBefore = usdc.nonces(alice);

        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            1000 * 1e6,
            deadline
        );

        vm.prank(alice);
        engine.depositWithPermit(1000 * 1e6, 1000 * 1e6, deadline, v, r, s);

        uint256 nonceAfter = usdc.nonces(alice);
        assertEq(nonceAfter, nonceBefore + 1);
    }

    // ============ Three Workflow Tests ============

    function test_Workflow1_NoAllowanceNoFunds_UsePermit() public {
        // Scenario: New user with no approval, no funds in engine
        // Solution: Use depositAndOpenPositionWithPermit for gasless onboarding

        uint256 depositAmount = 5000 * 1e6;
        uint256 deadline = block.timestamp + 1 hours;

        // Verify no prior approval
        assertEq(usdc.allowance(alice, address(engine)), 0);
        // Verify no funds in engine
        assertEq(engine.getWalletBalance(alice), 0);

        // Generate permit signature
        (uint8 v, bytes32 r, bytes32 s) = _generatePermitSignature(
            alice,
            alicePrivateKey,
            address(engine),
            MAX_UINT256,
            deadline
        );

        // Open position with permit in one transaction
        vm.prank(alice);
        uint256 positionId = engine.depositAndOpenPositionWithPermit(
            depositAmount,
            MAX_UINT256,
            true, // Long
            1000 * PRECISION,
            10 * PRECISION,
            deadline,
            v,
            r,
            s
        );

        // Verify success
        assertEq(positionId, 1);
        assertEq(engine.getWalletBalance(alice), 4000 * PRECISION); // 5000 - 1000
    }

    function test_Workflow2_HasAllowanceNoFunds_UseDepositAndOpen() public {
        // Scenario: User has unlimited approval set, but no funds in engine
        // Solution: Use depositAndOpenPosition (no permit needed)

        uint256 depositAmount = 3000 * 1e6;

        // Set unlimited approval beforehand
        vm.prank(alice);
        usdc.approve(address(engine), MAX_UINT256);

        // Verify approval exists
        assertEq(usdc.allowance(alice, address(engine)), MAX_UINT256);
        // Verify no funds in engine
        assertEq(engine.getWalletBalance(alice), 0);

        // Deposit and open in one transaction (no permit needed)
        vm.prank(alice);
        uint256 positionId = engine.depositAndOpenPosition(
            depositAmount,
            true, // Long
            500 * PRECISION,
            5 * PRECISION
        );

        // Verify success
        assertEq(positionId, 1);
        assertEq(engine.getWalletBalance(alice), 2500 * PRECISION); // 3000 - 500
    }

    function test_Workflow3_HasAllowanceAndFunds_UseOpen() public {
        // Scenario: User has approval and already has funds in engine
        // Solution: Use openPosition directly (most gas efficient)

        // Setup: Give alice unlimited approval and deposit funds
        vm.startPrank(alice);
        usdc.approve(address(engine), MAX_UINT256);
        engine.deposit(10_000 * 1e6);
        vm.stopPrank();

        // Verify setup
        assertEq(usdc.allowance(alice, address(engine)), MAX_UINT256);
        assertEq(engine.getWalletBalance(alice), 10_000 * PRECISION);

        // Just open position (no deposit needed)
        vm.prank(alice);
        uint256 positionId = engine.openPosition(
            false, // Short
            2000 * PRECISION,
            15 * PRECISION
        );

        // Verify success
        assertEq(positionId, 1);
        assertEq(engine.getWalletBalance(alice), 8000 * PRECISION); // 10000 - 2000
    }
}
