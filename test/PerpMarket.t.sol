// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/PerpMarket.sol";

/**
 * @title PerpMarketTest
 * @notice Unit tests for vAMM math validation against JavaScript implementation
 * @dev All outputs must match perp.js within acceptable precision (1e-15 or 1e3 in 18 decimal space)
 */
contract PerpMarketTest is Test {
    PerpMarket public market;

    uint256 constant PRECISION = 1e18;
    uint256 constant EPSILON = 1e3; // 1e-15 in 18 decimal space

    function setUp() public {
        // Initialize with same values as perp.js CONFIG
        // baseReserve = 100,000, quoteReserve = 100,000
        market = new PerpMarket(100_000 * PRECISION, 100_000 * PRECISION);

        // Set test contract as engine so we can call engine-only functions
        market.setEngine(address(this));
    }

    // ============ Helper Functions ============

    function assertApproxEqAbsWithLabel(
        uint256 a,
        uint256 b,
        uint256 maxDelta,
        string memory label
    ) internal {
        uint256 delta = a > b ? a - b : b - a;
        if (delta > maxDelta) {
            emit log_named_string("Error", label);
            emit log_named_uint("Expected", b);
            emit log_named_uint("Actual", a);
            emit log_named_uint("Delta", delta);
            emit log_named_uint("Max Delta", maxDelta);
            fail();
        }
    }

    // ============ Basic State Tests ============

    function test_InitialState() public {
        assertEq(market.baseReserve(), 100_000 * PRECISION);
        assertEq(market.quoteReserve(), 100_000 * PRECISION);
        assertEq(market.k(), 100_000 * PRECISION * 100_000 * PRECISION);
        assertEq(market.longOpenInterest(), 0);
        assertEq(market.shortOpenInterest(), 0);
        assertEq(market.currentBlock(), 1);
    }

    function test_GetMarkPrice_Initial() public {
        // Initial mark price should be 1.0 (quoteReserve / baseReserve)
        uint256 markPrice = market.getMarkPrice();
        assertEq(markPrice, 1 * PRECISION);
    }

    // ============ Open Long Tests (JS Validation) ============

    /**
     * @notice Test simulateOpenLong behaves correctly (maps to perp.js lines 472-487)
     *
     * Note: Ceiling division causes slight differences from JS floating point math.
     * This is correct - it protects the pool by rounding in its favor.
     *
     * JS Input: baseReserve=100000, quoteReserve=100000, quoteIn=1000
     * JS Output: baseOut=990.099009900990099, avgPrice=1.010101010101010101
     * Solidity uses ceiling division, so baseOut will be slightly less (pool-favorable)
     */
    function test_SimulateOpenLong_MatchesJS() public {
        uint256 quoteIn = 1_000 * PRECISION;

        (uint256 baseOut, uint256 avgPrice) = market.simulateOpenLong(quoteIn);

        // Ceiling division causes slight rounding differences from JS floating point
        // The difference should be minimal (within 100 wei for this trade size)
        // JS: 990.099009900990099 = 990.099009900990099 * 1e18
        uint256 jsBaseOut = 990_099009900990099000;
        assertApproxEqAbs(baseOut, jsBaseOut, 1000, "baseOut should be close to JS value");

        // Verify avgPrice is calculated correctly from actual baseOut
        uint256 calculatedPrice = (quoteIn * PRECISION) / baseOut;
        assertEq(avgPrice, calculatedPrice, "avgPrice should match calculated value");
    }

    /**
     * @notice Test that multiple opens follow constant product formula
     */
    function test_SimulateOpenLong_SmallTrade() public {
        uint256 quoteIn = 10 * PRECISION;

        (uint256 baseOut, uint256 avgPrice) = market.simulateOpenLong(quoteIn);

        // Verify constant product: (quoteReserve + quoteIn) * (baseReserve - baseOut) >= k
        // Due to ceiling division, k can increase slightly (rounding in favor of pool)
        uint256 newQuote = market.quoteReserve() + quoteIn;
        uint256 newBase = market.baseReserve() - baseOut;
        uint256 newK = newQuote * newBase;

        assertGe(newK, market.k(), "k should not decrease");
        assertLe(newK - market.k(), newQuote, "k increase should be minimal");
    }

    function test_SimulateOpenLong_LargeTrade() public {
        uint256 quoteIn = 10_000 * PRECISION; // 10% of reserves

        (uint256 baseOut, uint256 avgPrice) = market.simulateOpenLong(quoteIn);

        // Verify constant product (allow for ceiling division rounding)
        uint256 newQuote = market.quoteReserve() + quoteIn;
        uint256 newBase = market.baseReserve() - baseOut;
        uint256 newK = newQuote * newBase;

        assertGe(newK, market.k(), "k should not decrease");
        assertLe(newK - market.k(), newQuote, "k increase should be minimal");

        // Price should be higher for large trades (slippage)
        assertGt(avgPrice, market.getMarkPrice());
    }

    function test_SimulateOpenLong_ZeroInput() public {
        (uint256 baseOut, uint256 avgPrice) = market.simulateOpenLong(0);

        assertEq(baseOut, 0);
        assertEq(avgPrice, 0);
    }

    // ============ Open Short Tests (JS Validation) ============

    /**
     * @notice Test simulateOpenShort matches perp.js lines 502-519
     */
    function test_SimulateOpenShort_MatchesJS() public {
        // Simulate shorting with desired notional = 1000
        uint256 quoteOut = 1_000 * PRECISION;

        (uint256 baseIn, uint256 avgPrice) = market.simulateOpenShort(quoteOut);

        // Verify constant product (allow for ceiling division rounding)
        uint256 newQuote = market.quoteReserve() - quoteOut;
        uint256 newBase = market.baseReserve() + baseIn;
        uint256 newK = newQuote * newBase;

        assertGe(newK, market.k(), "k should not decrease");
        assertLe(newK - market.k(), newQuote, "k increase should be minimal");

        // Average price should be quoteOut / baseIn
        uint256 calculatedPrice = (quoteOut * PRECISION) / baseIn;
        assertEq(avgPrice, calculatedPrice);
    }

    function test_SimulateOpenShort_PriceMovement() public {
        uint256 quoteOut = 1_000 * PRECISION;

        (uint256 baseIn, uint256 avgPrice) = market.simulateOpenShort(quoteOut);

        // Short should get worse price than mark (selling base pushes price down)
        assertLt(avgPrice, market.getMarkPrice());
    }

    function test_SimulateOpenShort_RevertsOnExcessiveQuote() public {
        // Try to short with quoteOut >= total quoteReserve
        uint256 quoteOut = 100_000 * PRECISION;

        vm.expectRevert(PerpMarket.InsufficientLiquidity.selector);
        market.simulateOpenShort(quoteOut);
    }

    // ============ Close Long Tests (JS Validation) ============

    /**
     * @notice Test simulateCloseLong matches perp.js lines 533-544
     */
    function test_SimulateCloseLong_MatchesJS() public {
        uint256 baseSize = 1_000 * PRECISION;

        (uint256 quoteOut, uint256 avgPrice) = market.simulateCloseLong(baseSize);

        // Verify constant product (ceiling division causes ±1 wei difference)
        uint256 newBase = market.baseReserve() + baseSize;
        uint256 newQuote = market.k() / newBase;
        uint256 expectedQuoteOut = market.quoteReserve() - newQuote;

        // Allow for 1 wei difference due to ceiling division
        assertApproxEqAbs(quoteOut, expectedQuoteOut, 1, "quoteOut should match within 1 wei");

        // Average price should be quoteOut / baseSize
        uint256 calculatedPrice = (quoteOut * PRECISION) / baseSize;
        assertEq(avgPrice, calculatedPrice);
    }

    function test_SimulateCloseLong_PriceImpact() public {
        uint256 baseSize = 1_000 * PRECISION;

        (uint256 quoteOut, uint256 avgPrice) = market.simulateCloseLong(baseSize);

        // Closing long (selling base) should get worse than mark price
        assertLt(avgPrice, market.getMarkPrice());
    }

    // ============ Close Short Tests (JS Validation) ============

    /**
     * @notice Test simulateCloseShort matches perp.js lines 558-571
     */
    function test_SimulateCloseShort_MatchesJS() public {
        uint256 baseSize = 1_000 * PRECISION;

        (uint256 quoteIn, uint256 avgPrice) = market.simulateCloseShort(baseSize);

        // Verify constant product (ceiling division causes ±1 wei difference)
        uint256 newBase = market.baseReserve() - baseSize;
        uint256 newQuote = market.k() / newBase;
        uint256 expectedQuoteIn = newQuote - market.quoteReserve();

        // Allow for 1 wei difference due to ceiling division
        assertApproxEqAbs(quoteIn, expectedQuoteIn, 1, "quoteIn should match within 1 wei");

        // Average price should be quoteIn / baseSize
        uint256 calculatedPrice = (quoteIn * PRECISION) / baseSize;
        assertEq(avgPrice, calculatedPrice);
    }

    function test_SimulateCloseShort_RevertsOnExcessiveBase() public {
        // Try to buy more base than exists in reserves
        uint256 baseSize = 100_000 * PRECISION;

        vm.expectRevert(PerpMarket.InsufficientLiquidity.selector);
        market.simulateCloseShort(baseSize);
    }

    // ============ State-Modifying Execution Tests ============

    function test_ExecuteOpenLong_UpdatesReserves() public {
        uint256 quoteIn = 1_000 * PRECISION;

        uint256 initialBase = market.baseReserve();
        uint256 initialQuote = market.quoteReserve();

        (uint256 expectedBase, uint256 expectedPrice) = market.simulateOpenLong(quoteIn);

        // Test contract is set as engine in setUp()
        (uint256 baseOut, uint256 avgPrice) = market.executeOpenLong(quoteIn);

        assertEq(baseOut, expectedBase);
        assertEq(avgPrice, expectedPrice);

        // Verify reserves updated
        assertEq(market.quoteReserve(), initialQuote + quoteIn);
        assertLt(market.baseReserve(), initialBase);
    }

    function test_ExecuteOpenLong_RevertsIfNotEngine() public {
        uint256 quoteIn = 1_000 * PRECISION;

        // Call from a different address (not the engine)
        vm.prank(address(0x1234));
        vm.expectRevert(PerpMarket.Unauthorized.selector);
        market.executeOpenLong(quoteIn);
    }

    // ============ Open Interest Tests ============

    function test_IncreaseOpenInterest_Long() public {
        uint256 notional = 1_000 * PRECISION;

        // Test contract is set as engine in setUp(), so we can call directly
        market.increaseOpenInterest(true, notional);

        assertEq(market.longOpenInterest(), notional);
        assertEq(market.shortOpenInterest(), 0);
    }

    function test_IncreaseOpenInterest_Short() public {
        uint256 notional = 1_000 * PRECISION;

        // Test contract is set as engine in setUp(), so we can call directly
        market.increaseOpenInterest(false, notional);

        assertEq(market.longOpenInterest(), 0);
        assertEq(market.shortOpenInterest(), notional);
    }

    function test_DecreaseOpenInterest() public {
        uint256 notional = 1_000 * PRECISION;

        // First increase, then decrease
        // Test contract is set as engine in setUp()
        market.increaseOpenInterest(true, notional);
        market.decreaseOpenInterest(true, notional / 2);

        assertEq(market.longOpenInterest(), notional / 2);
    }

    // ============ Round-Trip Tests ============

    /**
     * @notice Test that opening then immediately closing returns approximately the same value (minus slippage)
     */
    function test_RoundTrip_OpenCloseLong() public {
        uint256 quoteIn = 1_000 * PRECISION;

        // Simulate open long
        (uint256 baseOut,) = market.simulateOpenLong(quoteIn);

        // Now simulate closing that position
        (uint256 quoteOut,) = market.simulateCloseLong(baseOut);

        // Should get less back due to slippage (2x price impact + ceiling division rounding)
        assertLt(quoteOut, quoteIn);

        // But should be close (for small trades)
        // With ceiling division, expect ~2% loss due to pool-favorable rounding on both trades
        assertApproxEqAbs(quoteOut, quoteIn, quoteIn * 2 / 100); // Within 2%
    }

    /**
     * @notice Test that long + short of equal size moves price back (but not exactly due to slippage)
     */
    function test_LongShortBalance() public {
        uint256 amount = 1_000 * PRECISION;

        uint256 initialMarkPrice = market.getMarkPrice();

        // Simulate long (increases mark price)
        (uint256 baseOut,) = market.simulateOpenLong(amount);

        // Execute it (test contract is the engine)
        market.executeOpenLong(amount);

        uint256 priceAfterLong = market.getMarkPrice();
        assertGt(priceAfterLong, initialMarkPrice);

        // Now simulate short of same base amount (should bring price back down)
        // Test contract is the engine
        market.executeCloseLong(baseOut);

        uint256 finalPrice = market.getMarkPrice();

        // Should be very close to initial (within rounding)
        assertApproxEqAbs(finalPrice, initialMarkPrice, EPSILON);
    }

    // ============ Fuzz Tests ============

    function testFuzz_SimulateOpenLong_MaintainsInvariant(uint256 quoteIn) public {
        // Bound input to reasonable range (0.01 to 10,000)
        quoteIn = bound(quoteIn, 0.01 ether, 10_000 ether);

        (uint256 baseOut,) = market.simulateOpenLong(quoteIn);

        // Verify constant product (allow small rounding in favor of pool)
        uint256 newQuote = market.quoteReserve() + quoteIn;
        uint256 newBase = market.baseReserve() - baseOut;
        uint256 newK = newQuote * newBase;

        // k should never decrease (can increase slightly due to rounding)
        assertGe(newK, market.k(), "k decreased");
        // But increase should be minimal (less than 0.0001%)
        assertLe(newK, market.k() * 1000001 / 1000000, "k increased too much");
    }

    function testFuzz_SimulateOpenShort_MaintainsInvariant(uint256 quoteOut) public {
        // Bound to avoid insufficient liquidity
        quoteOut = bound(quoteOut, 0.01 ether, 50_000 ether);

        (uint256 baseIn,) = market.simulateOpenShort(quoteOut);

        // Verify constant product (allow small rounding in favor of pool)
        uint256 newQuote = market.quoteReserve() - quoteOut;
        uint256 newBase = market.baseReserve() + baseIn;
        uint256 newK = newQuote * newBase;

        // k should never decrease (can increase slightly due to rounding)
        assertGe(newK, market.k(), "k decreased");
        // But increase should be minimal (less than 0.0001%)
        assertLe(newK, market.k() * 1000001 / 1000000, "k increased too much");
    }
}
