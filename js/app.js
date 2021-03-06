var app = angular.module('myApp', [
  "checklist-model", 
  "ui.multiselect",
  "underscore",
  "smart-table"
]);

app.config( [
    '$compileProvider',
    function( $compileProvider ) {
        var currentImgSrcSanitizationWhitelist = $compileProvider.imgSrcSanitizationWhitelist();
        var newImgSrcSanitizationWhiteList = currentImgSrcSanitizationWhitelist.toString().slice(0,-1)
        + '|chrome-extension:'
        +currentImgSrcSanitizationWhitelist.toString().slice(-1);

        console.log("Changing imgSrcSanitizationWhiteList from "+currentImgSrcSanitizationWhitelist+" to "+newImgSrcSanitizationWhiteList);
        $compileProvider.imgSrcSanitizationWhitelist(newImgSrcSanitizationWhiteList);
    }
]);

app.run(function($rootScope, LoadGW2) {
  $rootScope.gw2 = {};
  $rootScope.gw2.icons = {};
  $rootScope.gw2.items = {};
  $rootScope.gw2.recipes = [];
  $rootScope.gw2.recipeIds = [];

  LoadGW2.fetchIcons();
  chrome.storage.local.get("recipes", function(recipes) {
    chrome.storage.local.get("itemIds", function(itemIds) {
      chrome.storage.local.get(itemIds["itemIds"], function(items) {
        if ((itemIds["itemIds"] === undefined) || (recipes["recipes"] === undefined)) {
          chrome.storage.local.clear(() => {
            LoadGW2.fetchRecipesAndItems();
          });
          console.log("Fetched from server");
        } else {
          $rootScope.gw2.recipes = recipes["recipes"];
          $rootScope.gw2.items = items;

          console.log("Loaded from local storage");    
          $rootScope.$apply();
        }
      });
    });
  });
});

app.service('LoadGW2', function($rootScope, endpoints, crafting, RenderIds, ReverseRenderIds, scribeBase64, _) {
  this.fetchRecipesAndItems = function() {
    var query = endpoints.v2Url + endpoints.recipes;
    httpGetAsync(query, (res) => {
      $rootScope.gw2.recipes = [];
      $rootScope.gw2.recipeIds = $.parseJSON(res);

      var idsPerChunk = endpoints.idsParamLimit;
      var chunks = Math.ceil($rootScope.gw2.recipeIds.length / idsPerChunk);
      var chunkArrays = [];
      var i, j;
      for (i = 0, j = $rootScope.gw2.recipeIds.length; i<j; i+=idsPerChunk) {
        chunkArrays.push($rootScope.gw2.recipeIds.slice(i,i+idsPerChunk));
      }

      chunkArrays.forEach((chunkArray) => {
        var newQuery = query + endpoints.idsParam + chunkArray.join();
        httpGetAsync(newQuery, (res) => {
          var arr = $.parseJSON(res);
          var recipeItemIds = [];
          $rootScope.gw2.recipes = _.union($rootScope.gw2.recipes, arr);

          recipeItemIds = arr.map((recipe) => {
            return recipe["ingredients"].map((ingredient) => {
              return ingredient["item_id"];
            });
          });

          // Flatten array
          recipeItemIds = [].concat.apply([], recipeItemIds);

          recipeItemIds = _.union(arr.map((recipe) => {
            return recipe["output_item_id"];
          }), recipeItemIds);

          this.fetchItemsById(recipeItemIds);
        });
      });
    });
  };

  this.fetchItemsById = function(itemIds) {

    var baseQuery = endpoints.v2Url + endpoints.items;

    var idsPerChunk = endpoints.idsParamLimit;
    var chunks = Math.ceil(itemIds.length / idsPerChunk);
    var chunkArrays = [];
    var i, j;
    for (i = 0, j = itemIds.length; i<j; i+=idsPerChunk) {
      chunkArrays.push(itemIds.slice(i,i+idsPerChunk));
    }

    chunkArrays.forEach((chunkArray) => {
      var query = baseQuery + endpoints.idsParam + chunkArray.join();

      httpGetAsync(query, (res) => {
        var itemArr = $.parseJSON(res);
        itemArr.forEach((item) => {
          $rootScope.gw2.items[item["id"]] = item;
        });
        $rootScope.$apply();
      });
    });
  };

  this.fetchIcons = function() {
    var query = endpoints.v2Url + endpoints.files + endpoints.idsParam;
    var iconInfos = {};

    query = query + crafting.disciplines.filter((discipline) => {
      return !!RenderIds[discipline];
    }).map((discipline) => {
      return RenderIds[discipline];
    }).join();

    httpGetAsync(query, (res) => {
      var iconInfoArr = $.parseJSON(res);
      iconInfoArr.forEach((iconInfo) => {
        httpGetBlobAsync(iconInfo["icon"], (res) => {
          $rootScope.gw2.icons[iconInfo["id"]] = window.URL.createObjectURL(res);
        });
      });
    });
    $rootScope.gw2.icons["map_crafting_scribe"] = scribeBase64["icon"];
  };


});

app.service('utilities', function ($rootScope, RenderIds) {
  var apiKey = "";

  this.getApiKey = function() {
    return apiKey;
  };

  this.setApiKey = function(value) {
    apiKey = value;
  };

  this.getIcon = function(iconId) {
    if (!!RenderIds[iconId]) {
      return $rootScope.gw2.icons[RenderIds[iconId]];
    } else if (!!$rootScope.gw2.icons[iconId]) {
      return $rootScope.gw2.icons[iconId];
    } else {
      if (!!$rootScope.gw2.icons[iconId]) {
        return $rootScope.gw2.icons[iconId];
      } else {
        $rootScope.gw2.icons[iconId] = "locked";
        var url = $rootScope.gw2.items[iconId]["icon"];
        httpGetBlobAsync(url, (res) => {
          $rootScope.gw2.icons[iconId] = window.URL.createObjectURL(res);
          $rootScope.$apply();
        });

        return $rootScope.gw2.icons[iconId];
      }
    }
  };
});

app.factory("ItemCollection", function() {
  var ItemCollection = function() {
    this.items = [];
  };

  ItemCollection.prototype.getItems = function() {
    return this.items;
  };
  ItemCollection.prototype.addItems = function(items) {
    this.items = _.union(this.items, items);
  };
  ItemCollection.prototype.addItem = function(item) {
    this.items.push(item);
  };
  ItemCollection.prototype.getItemById = function() {

  };

  return ItemCollection;
});

app.factory("Inventory", function(ItemCollection) {
  var Inventory = function() {
    this.inventory = {};
  };

  Inventory.prototype.addCharacter = function(characterId) {
    this.inventory[characterId] = new ItemCollection();
  };
  Inventory.prototype.addItemByCharacter = function(characterId, item) {
    this.inventory[characterId].addItem(item);
  };
  Inventory.prototype.addItemsByCharacter = function(characterId, items) {
    this.inventory[characterId].addItems(items);
  };
  Inventory.prototype.getItemsByCharacter = function(characterId) {
    return this.inventory[characterId].getItems();
  };
  Inventory.prototype.clearCharacters = function() {
    this.inventory = {};
  };
  Inventory.prototype.getInventories = function() {
    return this.inventory;
  };
  Inventory.prototype.getItems = function() {
    var result = [];
    Object.keys(this.inventory).forEach((characterId) => {
      result = _.union(result, this.getItemsByCharacter(characterId));
    });

    return result;
  }

  return Inventory;
});

app.service("UserItems", function(ItemCollection, Inventory) {
  var bank = new ItemCollection();
  var materialStorage = new ItemCollection();
  var inventory = new Inventory();
  var accountStorage = new ItemCollection();

  this.Bank = bank;
  this.MaterialStorage = materialStorage;
  this.Inventory = inventory;
  this.AccountStorage = accountStorage;

  this.getItemsInfo = function() {
    var result = {};
    var storageIds = {
      "Bank": bank,
      "Material": materialStorage,
      "Acount": accountStorage
    };
    var inventories = inventory.getInventories();

    Object.keys(inventories).forEach((characterId) => {
      storageIds[characterId] = inventories[characterId];
    });

    Object.keys(storageIds).forEach((storageId) => {
      storageIds[storageId].getItems().forEach((item) => {
        if (!!result[item["id"]]) {
          result[item["id"]]["count"] = result[item["id"]]["count"] + item["count"];
          result[item["id"]]["location"][storageId] = item["count"];
        } else {
          result[item["id"]] = {};
          result[item["id"]]["count"] = item["count"];
          result[item["id"]]["location"] = {}
          result[item["id"]]["location"][storageId] = item["count"];
        }
      });
    });

    return result;
  };

  this.getItems = function() {
    var itemInfo = this.getItemsInfo();
    var result = [];

    Object.keys(itemInfo).forEach((itemId) => {
      result.push({
        "id": itemId,
        "count": itemInfo[itemId]["count"]
      });
    });

    return result;
  };
});

app.service("LoadAccount", function($rootScope, utilities, endpoints, UserItems) {
  this.updateCharacters = function() {
    var query = endpoints.v2Url + endpoints.characters 
      + endpoints.authParam 
      + utilities.getApiKey()
      + "&" + endpoints.pageParam + "0";
    UserItems.Inventory.clearCharacters();

    httpGetAsync(query, (res) => {
      console.log(query);
      characters = $.parseJSON(res);
      characters.forEach((character) => {
        UserItems.Inventory.addCharacter(character["name"])
      });

      updateBags(characters);
    });
  };

  var updateBags = function(characters) {
    characters.forEach((character) => {
      character["bags"].forEach((bag) => {
        if (!!bag) {
          var inventory = bag["inventory"];
          UserItems.Inventory.addItemsByCharacter(character["name"], inventory.filter((item) => {
            return !!item && (!item.hasOwnProperty("binding") || item["binding"] === "Account");
          }).map((item) => {
            return {
              "id": item["id"],
              "count": item["count"]
            };
          }));
        } 
      });
    });
  };

  this.updateMaterialStorage = function() {
    var query = endpoints.v2Url + endpoints.accountMaterials 
      + endpoints.authParam 
      + utilities.getApiKey();
    httpGetAsync(query, (res) => {
      var craftingItems = $.parseJSON(res);
      UserItems.MaterialStorage.addItems(craftingItems.filter((item) => {
        return item["count"] > 0;
      }).map((item) => {
        return {
          "id": item["id"],
          "count": item["count"]
        };
      }));
    });
  };

  this.updateAccountStorage = function() {
    var query = endpoints.v2Url + endpoints.accountInventory 
      + endpoints.authParam 
      + utilities.getApiKey();
    httpGetAsync(query, (res) => {
      var craftingItems = $.parseJSON(res);
      UserItems.MaterialStorage.addItems(craftingItems.map((item) => {
        return {
          "id": item["id"],
          "count": item["count"]
        };
      }));
    });
  };

  this.updateBank = function() {
    var query = endpoints.v2Url + endpoints.accountBank 
      + endpoints.authParam 
      + utilities.getApiKey();
    httpGetAsync(query, (res) => {
      var bankItems = $.parseJSON(res);
      UserItems.Bank.addItems(bankItems.filter((item) => {
        return !!item && (!item.hasOwnProperty("binding") || item["binding"] === "Account");
      }).map((item) => {
        return {
          "id": item["id"],
          "count": item["count"]
        };
      }));

    });
  };
});

/***********************************************Main Controller****************************************/
app.controller('MainCtrl', function($scope, $rootScope, LoadGW2, endpoints, utilities, LoadAccount, AppProperties) {
  $scope.account = {}
  $scope.account.keyWarning = "Valid Key";
  $scope.account.apiKey;
  $scope.account.authenticated = true;
  $scope.account.img = "glyphicon-ok";
  $scope.account.glyphColour = "green";

  var KeyStatus = {
    VALID: 0,
    INVALID: 1,
    MISSING_PERMISSIONS: 2
  }

  var validateKey = function(apiKey, onSuccess, onFailure) {
    var query = endpoints.v2Url + endpoints.account;

    query += endpoints.authParam + apiKey;

    httpGetAsync(query, onSuccess, onFailure);
  };

  var checkPermissions = function(apiKey, onSuccess, onFailure) {
    var query = endpoints.v2Url + endpoints.tokenInfo;
    query += endpoints.authParam + apiKey;

    httpGetAsync(query, (res) => {
      var tokenInfo = $.parseJSON(res);
      var permissions = tokenInfo["permissions"];
      if (AppProperties.requiredPermissions.every((p) => { return permissions.indexOf(p) >= 0 })) {
        onSuccess();
      } else {
        onFailure();
      }
    });
  };

  $scope.account.keyChange = function(apiKey) {

    validateKey(apiKey, () => { 
      checkPermissions(apiKey, () => { 
        keyError(KeyStatus.VALID);
        updateUser(apiKey);
      }, () => {
        keyError(KeyStatus.MISSING_PERMISSIONS);
      }); 
    }, () => { 
      keyError(KeyStatus.INVALID);
    });
  };

  var keyError = function(status) {
    switch (status) {
      case KeyStatus.VALID:
        $scope.account.glyphColour = "green";
        $scope.account.img = "glyphicon-ok";
        $scope.account.authenticated = true;
        $scope.account.keyWarning = "Valid Key";
        break;
      case KeyStatus.INVALID:
        $scope.account.glyphColour = "red";
        $scope.account.img = "glyphicon-remove";
        $scope.account.authenticated = false;
        $scope.account.keyWarning = "Invalid Key";
        break;
      case KeyStatus.MISSING_PERMISSIONS:
        $scope.account.glyphColour = "yellow";
        $scope.account.img = "glyphicon-warning-sign";
        $scope.account.authenticated = false;
        $scope.account.keyWarning = "Missing Permissions";
        break;
    }
    
    $scope.$apply();
  }

  var updateUser = function(apiKey) {
    console.log("Updating user")
    utilities.setApiKey(apiKey);

    LoadAccount.updateBank();
    LoadAccount.updateCharacters();
    LoadAccount.updateMaterialStorage();
    resetRequests();
  };

  $scope.account.saveLocal = function() {
    chrome.storage.local.clear(() => {
      var saveObj = $rootScope.gw2.items;
      saveObj["recipes"] = $rootScope.gw2.recipes;
      saveObj["itemIds"] = Object.keys($rootScope.gw2.items);

      chrome.storage.local.set(saveObj, () => {
        console.log("save successful")
      });
    });
  };

  $scope.account.clearLocal = function() {
    chrome.storage.local.clear(() => {
      console.log("Clear successful");
    });
  };

  $scope.account.reloadFromServer = function() {
    LoadGW2.fetchRecipesAndItems();
  };

  $scope.account.keyChange($scope.account.apiKey);
});

/************************Filter Controller*************************************/
app.controller('FilterCtrl', function($scope, $sce, $rootScope, crafting, endpoints, utilities, _, UserItems, RarityColourCode) {
  var apiKey = utilities.getApiKey();
  $scope.CONST = crafting;

  $scope.selectedTypeModels = jQuery.extend({}, $scope.CONST.craftType);

  $scope.selectedDisciplinesModel = $scope.CONST.disciplines.clone();
  $scope.recipes = $rootScope.gw2.recipes;

  $scope.craftingList = [];

  $scope.idsToHtmlImgs = function(objs) {
    var html = "<div>";
    objs.forEach((obj) => {
      var id = obj["id"];
      var count = obj["count"];
      var img = utilities.getIcon(id);
      if (!!img) {
        if (!!$rootScope.gw2.items[id]) {
          var rarity = $rootScope.gw2.items[id]["rarity"];

          html = html + "<a style=\"color:" + RarityColourCode[rarity] + ";\" hoverDetails=\"" + hoverDetails(id, count) + "\"><img class=\"icons\" src=" + img + ">";
        } else {
          html = html + "<a style=\"color:white;\" hoverDetails=\"" + hoverDetails(id) + "\"><img class=\"craftingIcons\" src=" + img + ">";
        }
      }
    });

    html = html + "</div></a>";

    return $sce.trustAsHtml(html);
  };

  function hoverDetails(id, count) {
    var res = "";
    if (!!$rootScope.gw2.items[id]) {
      if (!!count) {
        res =  count + " x " + $rootScope.gw2.items[id]["name"];
      } else {
        res =  $rootScope.gw2.items[id]["name"];
      }
    } else {
      res = id;
    } 
    return res;
  }

  var updateCraftingList = function() {
    var result = {};

    var selectedItemTypes = getSelectedTypes();

    $scope.craftingList = $scope.recipes.filter((recipe) => {
      return !_.isEmpty(_.intersection(recipe.disciplines, $scope.selectedDisciplinesModel));
    }).filter((recipe) => {
      return _.contains(selectedItemTypes, recipe["type"]);
    }).map((recipe) => {
      return {
        "id": recipe["id"],
        "craftableAmount": calculateCraftableAmount(recipe["id"]),
        "min_rating": recipe["min_rating"],
        "type": recipe["type"],
        "craftedItem": [{"id": recipe["output_item_id"], "count": recipe["output_item_count"]}],
        "disciplines": recipe["disciplines"].map((discipline) => {
          return {"id": discipline};
        }),
        "ingredients": recipe["ingredients"].map((item) => {
          return {"id" : item["item_id"], "count" : item["count"]};
        })
      }
    });
  };

  var calculateCraftableAmount = function(recipeId) {
    var items = UserItems.getItems();
    if (!$scope.recipes[recipeId]) {
      return 0; 
    }

    var requiredItems = $scope.recipes[recipeId]["ingredients"].map((ingredient) => {
      return {"id": ingredient["item_id"].toString(), "count": ingredient["count"]};
    });
    var requiredItemIds = requiredItems.map((item) => { return item["id"]; });

    var ownedItems = items.filter((item) => {
      return requiredItemIds.indexOf(item["id"]) >= 0;
    });

    if (ownedItems.length !== requiredItems.length) {
      return 0;
    }

    /* Precon: requiredItems and ownedItems are an array of JSON objects
     * such that each obj in requiredItems, there is exactly one
     * obj2 in ownedItems such that obj["id"] === obj2["id"]
     */
    requiredItems = _.sortBy(requiredItems, (item) => {
      return item["id"];
    });
    ownedItems = _.sortBy(ownedItems, (item) => {
      return item["id"];
    });

    var multiples = _.map(_.zip(ownedItems, requiredItems), function (pairItems) {
      var oItem = pairItems[0];
      var rItem = pairItems[1];
      return Math.floor(oItem["count"] / rItem["count"]);
    }, []);
    
    return _.min(multiples);
  };

  var getSelectedTypes = function() {
    return _.reduce(Object.keys($scope.selectedTypeModels).map((cls) => {
      return $scope.selectedTypeModels[cls];
    }), (memo, arr) => {
      return _.union(memo, arr);
    }, []);
  }

  $scope.refresh = function() {
    requests = 0;
    $scope.recipes = $rootScope.gw2.recipes;
    updateCraftingList();
  };

  $scope.updateAllDisciplines = function($event) {
    if ($event.target.checked) {
      $scope.CONST.disciplines.forEach((discipline) => {
        if ($scope.selectedDisciplinesModel.indexOf(discipline) < 0) {
          $scope.selectedDisciplinesModel.push(discipline);
        }
      });
    } else {
      $scope.selectedDisciplinesModel.length = 0;
    }
  };

  $scope.isAllSelected = function() {
    return $scope.CONST.disciplines.length === $scope.selectedDisciplinesModel.length;
  };

  $scope.isLoading = function() {
    var requests = requestsAlive();
    if (requests <= 0) {
      return false;
    } else {
      return true;
    }
  };
});

