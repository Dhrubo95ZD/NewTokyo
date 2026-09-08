package com.neotokyo.underworld;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.QueryPurchasesResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin native bridge only. It never grants an in-game entitlement; the
 * verified purchase token is sent to the Supabase function by the web app.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private final Map<String, ProductDetails> productDetails = new HashMap<>();

    @Override
    public void load() {
        super.load();
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(
                        com.android.billingclient.api.PendingPurchasesParams.newBuilder()
                                .enableOneTimeProducts()
                                .build())
                .enableAutoServiceReconnection()
                .build();
        connect(null);
    }

    private void connect(final Runnable after) {
        if (billingClient == null) {
            if (after != null) after.run();
            return;
        }
        if (billingClient.isReady()) {
            if (after != null) after.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingServiceDisconnected() {
                // Billing 9 auto-reconnects on the next API call.
            }

            @Override
            public void onBillingSetupFinished(com.android.billingclient.api.BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && after != null) after.run();
            }
        });
    }

    @PluginMethod
    public void getProducts(final PluginCall call) {
        final JSArray requested = call.getArray("products");
        final List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        if (requested != null) {
            for (int index = 0; index < requested.length(); index++) {
                try {
                    JSObject item = requested.getJSONObject(index);
                    String productId = item.getString("productId", "");
                    if (productId.isEmpty()) continue;
                    String productType = "subscription".equals(item.getString("productType", ""))
                            ? BillingClient.ProductType.SUBS : BillingClient.ProductType.INAPP;
                    products.add(QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId)
                            .setProductType(productType)
                            .build());
                } catch (Exception ignored) {
                    // Invalid catalog entries are ignored; no purchase can be launched for them.
                }
            }
        }
        connect(() -> {
            if (products.isEmpty()) {
                call.resolve(new JSObject().put("products", new JSArray()));
                return;
            }
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                    .setProductList(products)
                    .build();
            billingClient.queryProductDetailsAsync(params, (result, detailsResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || detailsResult == null) {
                    call.reject(result.getDebugMessage());
                    return;
                }
                JSArray response = new JSArray();
                List<ProductDetails> details = detailsResult.getProductDetailsList();
                if (details != null) {
                    for (ProductDetails detail : details) {
                        productDetails.put(detail.getProductId(), detail);
                        response.put(productJson(detail));
                    }
                }
                call.resolve(new JSObject().put("products", response));
            });
        });
    }

    private JSObject productJson(ProductDetails detail) {
        JSObject json = new JSObject()
                .put("productId", detail.getProductId())
                .put("productType", detail.getProductType());
        if (BillingClient.ProductType.SUBS.equals(detail.getProductType())) {
            List<ProductDetails.SubscriptionOfferDetails> offers = detail.getSubscriptionOfferDetails();
            if (offers != null && !offers.isEmpty()) {
                ProductDetails.SubscriptionOfferDetails offer = offers.get(0);
                json.put("offerToken", offer.getOfferToken());
                List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                if (phases != null && !phases.isEmpty()) json.put("formattedPrice", phases.get(phases.size() - 1).getFormattedPrice());
            }
        } else if (detail.getOneTimePurchaseOfferDetails() != null) {
            json.put("formattedPrice", detail.getOneTimePurchaseOfferDetails().getFormattedPrice());
        }
        return json;
    }

    @PluginMethod
    public void purchase(final PluginCall call) {
        final String productId = call.getString("productId", "");
        final String offerToken = call.getString("offerToken", "");
        connect(() -> {
            ProductDetails detail = productDetails.get(productId);
            if (detail == null) {
                call.reject("Product details are not loaded");
                return;
            }
            BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams
                    .newBuilder().setProductDetails(detail);
            if (!offerToken.isEmpty()) item.setOfferToken(offerToken);
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Arrays.asList(item.build()))
                    .build();
            BillingClient.BillingResult result = billingClient.launchBillingFlow(getActivity(), flow);
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) call.reject(result.getDebugMessage());
            else call.resolve(new JSObject().put("launched", true).put("responseCode", result.getResponseCode()));
        });
    }

    @PluginMethod
    public void restorePurchases(final PluginCall call) {
        connect(() -> {
            final int[] remaining = {2};
            final int[] total = {0};
            final Runnable done = () -> {
                remaining[0] -= 1;
                if (remaining[0] == 0) call.resolve(new JSObject().put("restored", total[0]));
            };
            queryPurchases(BillingClient.ProductType.INAPP, total, done);
            queryPurchases(BillingClient.ProductType.SUBS, total, done);
        });
    }

    private void queryPurchases(String type, int[] total, Runnable done) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(type).build();
        billingClient.queryPurchasesAsync(params, (result, purchasesResult) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchasesResult != null) {
                List<Purchase> purchases = purchasesResult.getPurchasesList();
                if (purchases != null) {
                    for (Purchase purchase : purchases) {
                        total[0] += 1;
                        notifyListeners("purchaseUpdated", purchaseJson(purchase));
                    }
                }
            }
            done.run();
        });
    }

    @Override
    public void onPurchasesUpdated(com.android.billingclient.api.BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) notifyListeners("purchaseUpdated", purchaseJson(purchase));
        } else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            notifyListeners("purchaseUpdated", new JSObject().put("status", "cancelled"));
        } else {
            notifyListeners("purchaseUpdated", new JSObject().put("status", "error").put("message", result.getDebugMessage()));
        }
    }

    private JSObject purchaseJson(Purchase purchase) {
        JSArray products = new JSArray();
        List<String> ids = purchase.getProducts();
        if (ids != null) for (String id : ids) products.put(id);
        return new JSObject()
                .put("purchaseToken", purchase.getPurchaseToken())
                .put("products", products)
                .put("orderId", purchase.getOrderId())
                .put("purchaseState", purchase.getPurchaseState())
                .put("acknowledged", purchase.isAcknowledged())
                .put("purchaseTime", purchase.getPurchaseTime())
                .put("quantity", purchase.getQuantity())
                .put("autoRenewing", purchase.isAutoRenewing());
    }
}
