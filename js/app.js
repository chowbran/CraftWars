var app = angular.module('myApp', [
  "checklist-model", 
  "ui.multiselect",
  "underscore",
  "smart-table"
]);

app.run(function($rootScope, endpoints, _) {
  $rootScope.gw2 = {};
  $rootScope.gw2.recipes = [];
  $rootScope.gw2.recipeIds = [];

  var fetchRecipes = function() {
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
          $rootScope.gw2.recipes = _.union($rootScope.gw2.recipes, arr);
        });
      });
    });
  };

  fetchRecipes();
});

app.service('utilities', function () {
  var utils = {
    'apiKey': ""
  };

  return {
      getUtils: function () {
          return utils;
      },
      setUtils: function(value) {
          utils = value;
      }
  };
});

app.service('account', function () {
  var items = [];
  var bankItems = [];

  var characters = {};
  var arrayOfCharacters = [];

  return {
      getItems: function() {
          return items;
      },
      setItems: function(item) {
          items = item;
      },
      getBankItems: function() {
          return items;
      },
      setBankItems: function(item) {
          bankItems = item;
      },
      getArrayOfCharacters: function() {
        return arrayOfCharacters;
      },
      getCharacters: function() {
        return characters;
      },
      addCharacter: function(character) {
        characters[character] = null;
        if (arrayOfCharacters.indexOf(character)) {
          arrayOfCharacters.push(character);
        }
      },
      clearCharacters: function() {
        characters = {};
        arrayOfCharacters = [];
      }
  };
});

/***********************************************Main Controller****************************************/
app.controller('MainCtrl', function($scope, endpoints, utilities, account) {
  var temp_key = "7B3452F9-F497-6A46-B8DF-FB0C0126853E6C9B3BB0-8788-484D-B465-A4FF112F9789";
  $scope.utils = {};
  $scope.utils.items = [];
  $scope.utils.apiKey = temp_key;
  // utilities.setUtils({'apiKey': $scope.utils.apiKey});
  utilities.getUtils()['apiKey'] = $scope.utils.apiKey;

  $scope.utils.updateView = function() {
    console.log($scope.utils.apiKey);
    var query = endpoints.v2Url + endpoints.characters + endpoints.authParam + $scope.utils.apiKey;
    // httpGetAsync(query, (res) => {
    //   $scope.utils.items = $.parseJSON(res);
    //   console.log($scope.utils.items);
    // });
    updateBank();
    updateCharacters();
  };

  var updateCharacters = function() {
    var query = endpoints.v2Url + endpoints.characters + endpoints.authParam + $scope.utils.apiKey;
    account.clearCharacters();

    httpGetAsync(query, (res) => {
      $.parseJSON(res).forEach((character) => {
        account.addCharacter(character);
      });
      console.log(account.getCharacters());
    });

  }

  var updateBank = function() {
    var query = endpoints.v2Url + endpoints.accountBank + endpoints.authParam + $scope.utils.apiKey;
    httpGetAsync(query, (res) => {
      var bankItems = $.parseJSON(res);
      account.setItems(bankItems.filter((item) => {
        return !!item && (!item.hasOwnProperty("binding") || item["binding"] === "Account");
      }).map((item) => {
        return {
          "id": item["id"],
          "count": item["count"]
        };
      }));
    });
  }

  $scope.$watch('apiKey', $scope.utils.updateView);
});

/***********************************************Timer Controller****************************************/
app.controller('TimerCtrl', function($scope, $timeout) {
  $scope.date = {};
  // Update function
  var updateTime = function() {
    $scope.date.raw = new Date();
    $timeout(updateTime, 1000);
  }
  // Kick off the update function
  updateTime();
});

/************************Filter Controller*************************************/
app.controller('FilterCtrl', function($scope, crafting, endpoints, utilities, account, _) {
  var apiKey = utilities.getUtils()["apiKey"];
  console.log(apiKey);
  $scope.crafting = crafting;
  $scope.crafting.selectedTypes = [];
  $scope.crafting.selectedTypeModels = {};
  $scope.crafting.selectedDisciplinesModel = [];

  $scope.crafting.updateSelectedTypes = function () {
    $scope.crafting.selectedTypes.length = 0;
    $scope.crafting.craftClass.forEach((cls) => {
      $scope.crafting.selectedTypes = 
        _.union($scope.crafting.selectedTypes, $scope.crafting.selectedTypeModels[cls]);
    });
  };

  var fetchCrafts = function() {
    var query = endpoints.v2Url + endpoints.accountMaterials + endpoints.authParam + apiKey;
    httpGetAsync(query, (res) => {
      $scope.crafting.items = $.parseJSON(res);
    });
  };

  $scope.test1 = function() {
    console.log($scope.crafting.selectedDisciplinesModel);
    $scope.crafting.updateSelectedTypes();
    console.log($scope.crafting.selectedTypes);
  };

  $scope.crafting.updateAllDisciplines = function($event) {
    if ($event.target.checked) {
      $scope.crafting.crafts.forEach((craft) => {
        if ($scope.crafting.selectedDisciplinesModel.indexOf(craft.discipline) < 0) {
          $scope.crafting.selectedDisciplinesModel.push(craft.discipline);
        }
      });
    } else {
      $scope.crafting.selectedDisciplinesModel.length = 0;
    }
  };

  $scope.crafting.isAllSelected = function() {
    return $scope.crafting.crafts.length === $scope.crafting.selectedDisciplinesModel.length;
  };

  fetchCrafts();
});

