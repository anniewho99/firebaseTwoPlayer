/* Code from: https://www.youtube.com/watch?v=xhURh2RDzzg&list=PLfO8lBNeR6KJiOQx1an2Le96DmcP3Ggqe&index=1
Changes to original code:
- modular firebase 9.0 code
- collision detection between players
- changed game map

Known issues:
- desite collision detection, players can still move through each other because game states are not centralized -- legality of a move is determined locally and
  it might take some time to update the local game state
- any change in player state triggers players/ change

Possible extensions:
- single container gamestate that keeps the state locally 
- Restrict coin spawning to a single player
*/

// The following code uses the modular and functional approach of Firebase version 9
//force a rebuild
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js"; // "./firebase/firebase-auth.js"; 
import {
    getDatabase, ref, onValue, get, set, update, off,
    push, onChildAdded, onChildChanged,
    onChildRemoved, remove, serverTimestamp,
    query, orderByChild, equalTo, onDisconnect
} from "https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB0zBbR6ljy6GmmBPtqJFuG3b6t3FGG_P0",
  authDomain: "multiplayer-debug-780ad.firebaseapp.com",
  projectId: "multiplayer-debug-780ad",
  storageBucket: "multiplayer-debug-780ad.appspot.com",
  messagingSenderId: "1058404562799",
  appId: "1:1058404562799:web:25e8af3489564c5dcbda9a"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

let doorPlayerOneCoords = [];
let doorPlayerTwoCoords = [];

let doorPlayerOneadjusted = [];
let doorPlayerTwodjusted = [];
//let allDoors = [];

//let activePlayerCount = 0;

let isInitialLoad = true;  // Flag to check if we're loading initial data

let mapData = {
  minX: 1,
  maxX: 15,
  minY: 1,
  maxY: 15,
  blockedSpaces: {  },
};

const GRIDS = [
  {start: [3, 3], end: [5, 5]},
  {start: [3, 11], end: [5, 13]},
  {start: [11, 3], end: [13, 5]},
  {start: [11, 11], end: [13, 13]}
];  

const GRIDSWITHID = [
  {id: "grid1", start: [3, 3], end: [5, 5], occupiedBy: null},
  {id: "grid2", start: [3, 11], end: [5, 13], occupiedBy: null},
  {id: "grid3", start: [11, 3], end: [13, 5], occupiedBy: null},
  {id: "grid4", start: [11, 11], end: [13, 13], occupiedBy: null}
];

function initializeGridsInFirebase() {
  const gridsRef = ref(database, 'grids');
  GRIDSWITHID.forEach(grid => {
    set(ref(database, `grids/${grid.id}`), { occupiedBy: null });
  });
}



const DIRECTIONS = [[0, 1], [1, 0], [0, -1], [-1, 0]];


let door_movements = [];

for (let grid of GRIDS) {
    let top_middle = [grid['start'][0], grid['start'][1] + 1];
    let bottom_middle = [grid['end'][0], grid['end'][1] - 1];
    let left_middle = [grid['start'][0] + 1, grid['start'][1]];
    let right_middle = [grid['end'][0] - 1, grid['end'][1]];

    // top middle entering and exiting
    door_movements.push([[top_middle[0] - 1, top_middle[1]], top_middle]);
    door_movements.push([top_middle, [top_middle[0] - 1, top_middle[1]]]);

    // bottom middle entering and exiting
    door_movements.push([[bottom_middle[0] + 1, bottom_middle[1]], bottom_middle]);
    door_movements.push([bottom_middle, [bottom_middle[0] + 1, bottom_middle[1]]]);

    // left middle entering and exiting
    door_movements.push([[left_middle[0], left_middle[1] - 1], left_middle]);
    door_movements.push([left_middle, [left_middle[0], left_middle[1] - 1]]);

    // right middle entering and exiting
    door_movements.push([[right_middle[0], right_middle[1] + 1], right_middle]);
    door_movements.push([right_middle, [right_middle[0], right_middle[1] + 1]]);
}

let forbidden_moves = [];

GRIDS.forEach(grid => {
    let corners = [
        grid.start,
        [grid.start[0], grid.end[1]],
        [grid.end[0], grid.start[1]],
        grid.end
    ];
    corners.forEach(corner => {
        DIRECTIONS.forEach(direction => {
            let next_pos = [corner[0] + direction[0], corner[1] + direction[1]];
            if (next_pos[0] < grid.start[0] || next_pos[0] > grid.end[0] || 
                next_pos[1] < grid.start[1] || next_pos[1] > grid.end[1]) {
                forbidden_moves.push([corner, next_pos].toString());
                forbidden_moves.push([next_pos, corner].toString());
            }
        });
    });
});

// Deduplicate forbidden moves
forbidden_moves = Array.from(new Set(forbidden_moves));

// Options for Player Colors... these are in the same order as our sprite sheet
const playerColors = ["blue", "red", "orange", "yellow", "green", "purple"];

//Misc Helpers
function randomFromArray(array) {
  return array[Math.floor(Math.random() * array.length)];
}
function getKeyString(x, y) {
  return `${x}x${y}`;
}

// Function to get the first key for a given value
function getFirstKeyForValue(object, valueToMatch) {
  for (let key in object) {
    if (object[key] === valueToMatch) {
      return key; // Return immediately when the first match is found
    }
  }
  return null; // Return null if no match is found
}

function createName() {
  const prefix = randomFromArray([
    "COOL",
    "SUPER",
    "HIP",
    "SMUG",
    "COOL",
    "SILKY",
    "GOOD",
    "SAFE",
    "DEAR",
    "DAMP",
    "WARM",
    "RICH",
    "LONG",
    "DARK",
    "SOFT",
    "BUFF",
    "DOPE",
  ]);
  const animal = randomFromArray([
    "BEAR",
    "DOG",
    "CAT",
    "FOX",
    "LAMB",
    "LION",
    "BOAR",
    "GOAT",
    "VOLE",
    "SEAL",
    "PUMA",
    "MULE",
    "BULL",
    "BIRD",
    "BUG",
  ]);
  return `${prefix} ${animal}`;
}

function outlineSubgrids() {
  const container = document.querySelector(".game-container");
  const gridSize = 16; // assuming each cell is represented as 16x16 pixels in your scaled image

  GRIDS.forEach(grid => {
    // Create walls along the perimeter of each subgrid
    ['top', 'bottom', 'left', 'right'].forEach(side => {
      const wall = document.createElement('div');
      wall.style.position = 'absolute';
      wall.style.backgroundColor = 'darkgrey';

      if (side === 'top' || side === 'bottom') {
        wall.style.left = `${(grid.start[0] - 1) * gridSize}px`;
        wall.style.width = `${(grid.end[0] - grid.start[0] + 1) * gridSize}px`;
        wall.style.height = '2px'; // thickness of the wall
        if (side === 'top') {
          wall.style.top = `${(grid.start[1] - 1) * gridSize }px`;
        } else {
          wall.style.top = `${grid.end[1] * gridSize}px`;
        }
      } else {
        wall.style.top = `${(grid.start[1] - 1) * gridSize}px`;
        wall.style.height = `${(grid.end[1] - grid.start[1] + 1) * gridSize}px`;
        wall.style.width = '2px'; // thickness of the wall
        if (side === 'left') {
          wall.style.left = `${(grid.start[0] - 1) * gridSize}px`;
        } else {
          wall.style.left = `${grid.end[0] * gridSize}px`;
        }
      }

      container.appendChild(wall);
    });
  });
}

function adjustCoord(coord) {
  return [
      coord[0] === 6 ? 6 : (coord[0] === 14 ? 14 : coord[0]),
      coord[1] === 6 ? 6 : (coord[1] === 14 ? 14 : coord[1])
  ];
}

function arraysEqual(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
  }

  return true;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
}

function calculateDoors() {
  let doorPlayerOneCoords = [];
  let doorPlayerTwoCoords = [];

  let doorPlayerOneadjusted = [];
  let doorPlayerTwodjusted = [];
  let allDoors = []; 
  for (let grid of GRIDS) {
      const [startX, startY] = grid.start;
      const [endX, endY] = grid.end;

      // Calculate door positions
      const doors = [
          { coord: [startX, Math.floor((endY + startY) / 2)], orientation: "V" },
          { coord: [endX + 1, Math.floor((endY + startY) / 2)], orientation: "V" },
          // Commented out horizontal doors for now
          // { coord: [Math.floor((endX + startX) / 2), endY + 1], orientation: "H" },
          // { coord: [Math.floor((endX + startX) / 2), startY], orientation: "H" }
      ];

      shuffle(doors);

      doorPlayerOneCoords.push({ ...doors[0]});
      doorPlayerTwoCoords.push({ ...doors[1]});

      doorPlayerOneadjusted = doorPlayerOneCoords.map(door => adjustCoord(door.coord));
      doorPlayerTwodjusted = doorPlayerTwoCoords.map(door => adjustCoord(door.coord));
      allDoors.push(...doors);
      console.log(doorPlayerOneadjusted);
      console.log(doorPlayerTwodjusted);
  }

  return {
    doorPlayerOneCoords,
    doorPlayerTwoCoords,
    doorPlayerOneadjusted,
    doorPlayerTwodjusted,
    allDoors,
};
}

function crossesDoor(start, end, playerID) {
  let validAdjustedDoors;
  const doorsRef = ref(database, 'doors');
  get(doorsRef).then((snapshot) => {
    if (snapshot.exists()) {
        const doorsData = snapshot.val();
        doorPlayerOneadjusted = doorsData.doorPlayerOneadjusted;
        doorPlayerTwodjusted = doorsData.doorPlayerTwodjusted;
        console.log("Doors retrieved from Firebase:", doorsData);
    }
}).catch(error => {
    console.error("Error retrieving doors data:", error);
});
  if (playerID === 0) {
      validAdjustedDoors = doorPlayerOneadjusted;
  } else if (playerID === 1) {
      validAdjustedDoors = doorPlayerTwodjusted;
  } else {
      return false; // Invalid player type
  }
  const startExists = validAdjustedDoors.find(door => arraysEqual(door, start));
  const endExists = validAdjustedDoors.find(door => arraysEqual(door, end));
  
  if (startExists) {
      //console.log("Entering the start door they own");
      startExists[0] = startExists[0] === 5 ? 6 : startExists[0];
      startExists[0] = startExists[0] === 13 ? 14 : startExists[0];
      //let door = { coord: startExists, orientation: "V" };
      fetchAndDrawDoors();
      return startExists;
  } else if (endExists) {
      //console.log("Entering the end door they own");
      endExists[0] = endExists[0] === 5 ? 6 : endExists[0];
      endExists[0] = endExists[0] === 13 ? 14 : endExists[0];
      //let door = { coord: endExists, orientation: "V" };
      fetchAndDrawDoors();
      return endExists;
  } else {
      //console.log('Entering a door they don\'t own');
      return false;
  }    
  
}

function fetchAndDrawDoors() {

  const playersRef = ref(database, 'players');
    get(playersRef).then((snapshot) => {
        if (snapshot.exists()) {
            const players = snapshot.val();
            const playerDoors = [];

            Object.keys(players).forEach(playerId => {
                const player = players[playerId];
                let doorCoords = [];

                // Determine which door coordinates to use based on player order
                if (player.order === 0) {
                    doorCoords = doorPlayerOneadjusted;
                } else if (player.order === 1) {
                    doorCoords = doorPlayerTwodjusted;
                }

                // Prepare door data for drawing
                playerDoors.push({
                    coords: doorCoords,
                    color: player.color // Fetching color dynamically
                });
            });

            // Call the function to draw doors with the dynamically fetched data
            drawDoors(playerDoors);
        } else {
            console.log("No player data available.");
        }
    }).catch(error => {
        console.error("Error fetching player data:", error);
    });
}

function drawDoors(playerDoors) {
    const gameContainer = document.querySelector(".game-container");
    const gridSize = 16; // Grid size

    playerDoors.forEach(player => {
        player.coords.forEach(coord => {
            const doorElement = document.createElement('div');
            doorElement.style.position = 'absolute';
            doorElement.style.width = '3px';
            doorElement.style.height = '16px'; // Height adjusted for vertical doors
            doorElement.style.backgroundColor = player.color;
            doorElement.style.left = `${(coord[0] - 1) * gridSize}px`;
            doorElement.style.top = `${ (coord[1] - 1) * gridSize}px`;
            gameContainer.appendChild(doorElement);
        });
    });
}

function isMoveAllowed(currentPosition, nextPosition, playerIndex) {
  let moveString = [currentPosition, nextPosition].toString();
  
  // Check if the move is forbidden
  if (forbidden_moves.includes(moveString)) {
      console.log("Move is forbidden.");
      return false;
  }

  // Check if the move is a valid door movement
  if (door_movements.some(move => move.toString() === moveString)) {
    console.log("Move through the door detected.");
    // Check if the move is valid through owned doors
    if (crossesDoor(currentPosition, nextPosition, playerIndex)) {
        console.log("Valid door move for player.");
        return true;
    } else {
        console.log("Invalid door move for player.");
        return false;
    }
}

  // You might need additional checks here for other types of allowed or disallowed moves
  console.log("Normal move allowed.");
  return true;
}

function displayMaxCapacityMessage() {
  alert("Sorry, the current game has reached maximum capacity. Please try again later.");
}

// function isOccupied(x,y) {

//   const blockedNextSpace = mapData.blockedSpaces[getKeyString(x, y)];
//   return (
//     blockedNextSpace ||
//     x > mapData.maxX ||
//     x < mapData.minX ||
//     y > mapData.maxY ||
//     y < mapData.minY
//   )
// }

function getRandomSafeSpot() {
  //We don't look things up by key here, so just return an x/y
  return randomFromArray([
    { x: 1, y: 4 },
    { x: 2, y: 4 },
    { x: 1, y: 5 },
    { x: 2, y: 6 },
    { x: 2, y: 8 },
    { x: 2, y: 9 },
    { x: 4, y: 8 },
    { x: 5, y: 5 },
    { x: 5, y: 8 },
    { x: 5, y: 10 },
    { x: 5, y: 11 },
    { x: 11, y: 7 },
    { x: 12, y: 7 },
    { x: 13, y: 7 },
    { x: 13, y: 6 },
    { x: 13, y: 8 },
    { x: 7, y: 6 },
    { x: 7, y: 7 },
    { x: 7, y: 8 },
    { x: 8, y: 8 },
    { x: 10, y: 8 },
    { x: 8, y: 8 },
    { x: 11, y: 4 },
  ]);
}

(function () {

  let playerId;
  let playerRef;
  let players = {};
  let playerElements = {};
  let coins = {};
  let coinElements = {};

  const gameContainer = document.querySelector(".game-container");
  const playerNameInput = document.querySelector("#player-name");
  const playerColorButton = document.querySelector("#player-color");


  function placeCoin() {
    const { x, y } = getRandomSafeSpot();
    /*
    const coinRef = firebase.database().ref(`coins/${getKeyString(x, y)}`);
    coinRef.set({
      x,
      y,
    })
    */

    const coinRef = ref(database, `coins/${getKeyString(x, y)}`);
    set(coinRef, {
      x,
      y,
    });

    const coinTimeouts = [2000, 3000, 4000, 5000];
    setTimeout(() => {
      placeCoin();
    }, randomFromArray(coinTimeouts));
  }

  function placeCoinsForPlayer(playerId, playerColor) {
    const gridsRef = ref(database, 'grids');
    get(gridsRef).then(snapshot => {
      if (snapshot.exists()) {
        let availableGrids = [];
        snapshot.forEach(child => {
          let grid = child.val();
          let gridId = child.key;
          if (!grid.occupiedBy) {
            availableGrids.push({...GRIDSWITHID.find(g => g.id === gridId), ...grid});
          }
        });
  
        if (availableGrids.length > 0) {
          let selectedGrid = randomFromArray(availableGrids);
          // Update the grid as occupied by the current player
          update(ref(database, `grids/${selectedGrid.id}`), { occupiedBy: playerId });
          // Place coins in the selected grid
          for (let i = 0; i < 3; i++) {
            const x = getRandomInt(selectedGrid.start[0], selectedGrid.end[0]);
            const y = getRandomInt(selectedGrid.start[1], selectedGrid.end[1]);
            const coinRef = ref(database, `coins/${getKeyString(x, y)}`);
            set(coinRef, {
              x,
              y,
              color: playerColor
            });
          }
        }
      }
    }).catch(error => {
      console.error("Error accessing grids:", error);
    });
  }
  

  function attemptGrabCoin(x, y) {
    const key = getKeyString(x, y);
    /*
    if (coins[key]) {
      // Remove this key from data, then uptick Player's coin count
      firebase.database().ref(`coins/${key}`).remove();
      playerRef.update({
        coins: players[playerId].coins + 1,
      })
    }
    */

    if (coins[key]) {
        const coinRef = ref(database, `coins/${key}`);
        remove(coinRef).then(() => {
          // Assuming you have a way to get a player's current coins
          const newCoinCount = players[playerId].coins + 1;
          update(playerRef, { coins: newCoinCount });
        });
    }
  }


  function handleArrowPress(xChange=0, yChange=0) {
    const oldX = players[playerId].x;
    const oldY = players[playerId].y;
    const newX = oldX + xChange;
    const newY = oldY + yChange;

    const index = players[playerId].order; 

    // Check if the new move is allowed
    if (isMoveAllowed([oldX, oldY], [newX, newY], index)) {
        // Move to the next space
        players[playerId].oldX = oldX;
        players[playerId].oldY = oldY;
        players[playerId].x = newX;
        players[playerId].y = newY;

        if (xChange === 1) {
            players[playerId].direction = "right";
        } else if (xChange === -1) {
            players[playerId].direction = "left";
        }

        // Update player position in Firebase
        set(playerRef, players[playerId]).catch(error => {
            console.error("Firebase set error", error);
        });

        // Attempt to grab a coin at the new position
        attemptGrabCoin(newX, newY);
    } else {
        console.log("Move not allowed.");
    }
}

function initGameDoors() {
  const doorsRef = ref(database, 'doors');
  get(doorsRef).then((snapshot) => {
        if (snapshot.exists()) {
            // Doors already calculated, retrieve and use them
            const doorsData = snapshot.val();
            doorPlayerOneCoords = doorsData.doorPlayerOneCoords;
            doorPlayerTwoCoords = doorsData.doorPlayerTwoCoords;
            doorPlayerOneadjusted = doorsData.doorPlayerOneadjusted;
            doorPlayerTwodjusted = doorsData.doorPlayerTwodjusted;
            console.log("Doors retrieved from Firebase:", doorsData);
        } else {
            // Doors not calculated, calculate and store them
            const doorsData = calculateDoors();
            set(doorsRef, doorsData).then(() => {
                console.log("Doors calculated and stored in Firebase");
                console.log(doorsData);
            }).catch(error => {
                console.error("Error storing doors in Firebase:", error);
            });
        }
    }).catch(error => {
        console.error("Error retrieving doors from Firebase:", error);
    });
}


  function initGame() {

    new KeyPressListener("ArrowUp", () => handleArrowPress(0, -1))
    new KeyPressListener("ArrowDown", () => handleArrowPress(0, 1))
    new KeyPressListener("ArrowLeft", () => handleArrowPress(-1, 0))
    new KeyPressListener("ArrowRight", () => handleArrowPress(1, 0))

    //const allPlayersRef = firebase.database().ref(`players`);
    //const allCoinsRef = firebase.database().ref(`coins`);
    const allPlayersRef = ref(database, 'players');
    const allCoinsRef = ref(database, 'coins');

    // get(allPlayersRef).then(snapshot => {
    //   if (snapshot.exists()) {
    //       activePlayerCount = Object.keys(snapshot.val()).length;
    //       console.log(Object.keys(snapshot.val()));
    //   }
    // });
  
    //allPlayersRef.on("value", (snapshot) => {
    onValue(allPlayersRef, (snapshot) => {
      //Fires whenever a change occurs
      players = snapshot.val() || {};
      Object.keys(players).forEach((key) => {
        const characterState = players[key];
        let el = playerElements[key];
        // Now update the DOM
        el.querySelector(".Character_name").innerText = characterState.name;
        el.querySelector(".Character_coins").innerText = characterState.coins;
        el.setAttribute("data-color", characterState.color);
        el.setAttribute("data-direction", characterState.direction);
        const left = 16 * (characterState.x-1) + "px";
        const top = 16 * (characterState.y-1) - 4 + "px";
        el.style.transform = `translate3d(${left}, ${top}, 0)`;

        // Update local game state !!!!!!
        if ((characterState.x != characterState.oldX) || (characterState.y != characterState.oldY)) {
            let newRef = getKeyString(characterState.x, characterState.y);
            mapData.blockedSpaces[newRef] = key;

            let oldRef = getKeyString(characterState.oldX, characterState.oldY);
            delete mapData.blockedSpaces[oldRef];
        }
        
      })
    })

    //allPlayersRef.on("child_added", (snapshot) => {
    onChildAdded(allPlayersRef, (snapshot) => {
      //Fires whenever a new node is added the tree

      //activePlayerCount++;

      // console.log("current number of player");
      // console.log(activePlayerCount);

      // if (activePlayerCount > 2) {
      //   console.log("Game full. No more players can join.");
      //   displayMaxCapacityMessage(); // Display an alert or handle the UI accordingly
      //   return; // Exit if game is full
      // }

      const addedPlayer = snapshot.val();
      //addedPlayer.order = activePlayerCount;

      const characterElement = document.createElement("div");
      characterElement.classList.add("Character", "grid-cell");
      if (addedPlayer.id === playerId) {
        characterElement.classList.add("you");
      }
      characterElement.innerHTML = (`
        <div class="Character_shadow grid-cell"></div>
        <div class="Character_sprite grid-cell"></div>
        <div class="Character_name-container">
          <span class="Character_name"></span>
          <span class="Character_coins">0</span>
        </div>
        <div class="Character_you-arrow"></div>
      `);
      playerElements[addedPlayer.id] = characterElement;

      //Fill in some initial state
      characterElement.querySelector(".Character_name").innerText = addedPlayer.name;
      characterElement.querySelector(".Character_coins").innerText = addedPlayer.coins;
      characterElement.setAttribute("data-color", addedPlayer.color);
      characterElement.setAttribute("data-direction", addedPlayer.direction);
      const left = 16 * (addedPlayer.x-1) + "px";
      const top = 16 * (addedPlayer.y-1) - 4 + "px";
      characterElement.style.transform = `translate3d(${left}, ${top}, 0)`;
      gameContainer.appendChild(characterElement);

      // Update local game state
      let newRef = getKeyString(addedPlayer.x, addedPlayer.y);
      mapData.blockedSpaces[ newRef ] = addedPlayer.id;
    })


    //Remove character DOM element after they leave
    //allPlayersRef.on("child_removed", (snapshot) => {
    onChildRemoved(allPlayersRef, (snapshot) => {  
    const removedPlayer = snapshot.val();
    const removedPlayerId = removedPlayer.id;
    const removedPlayerOrder = removedPlayer.order === 0 ? 1 : 0;  // Assuming 'order' is stored with the player data

    // Update lastPlayerOrder to the order of the removed player
    const lastOrderRef = ref(database, 'lastPlayerOrder');
    set(lastOrderRef, removedPlayerOrder).then(() => {
        console.log(`Updated lastPlayerOrder to ${removedPlayerOrder} after player removal.`);
    }).catch(error => {
        console.error("Error updating lastPlayerOrder:", error);
    });

    // Remove the player's HTML element and delete from local game state
    gameContainer.removeChild(playerElements[removedPlayerId]);
    delete playerElements[removedPlayerId];

    // Remove player from local game state
    let firstMatchingKey = getFirstKeyForValue(mapData.blockedSpaces, removedPlayerId);
    if (firstMatchingKey) {
        delete mapData.blockedSpaces[firstMatchingKey];
    }
  });



    //New - not in the video!
    //This block will remove coins from local state when Firebase `coins` value updates
    //allCoinsRef.on("value", (snapshot) => {
    onValue(allCoinsRef, (snapshot) => {
      coins = snapshot.val() || {};
    });
    //

    //allCoinsRef.on("child_added", (snapshot) => {
    onChildAdded(allCoinsRef, (snapshot) => {  
      const coin = snapshot.val();
      const key = getKeyString(coin.x, coin.y);
      coins[key] = true;

      // Create the DOM Element
      const coinElement = document.createElement("div");
      coinElement.classList.add("Coin", "grid-cell");
      coinElement.innerHTML = `
        <div class="Coin_shadow grid-cell"></div>
        <div class="Coin_sprite grid-cell"></div>
      `;

      // Position the Element
      const left = 16 * (coin.x-1) + "px";
      const top = 16 * (coin.y-1) - 4 + "px";
      coinElement.style.transform = `translate3d(${left}, ${top}, 0)`;

      // Keep a reference for removal later and add to DOM
      coinElements[key] = coinElement;
      gameContainer.appendChild(coinElement);
    })

    //allCoinsRef.on("child_removed", (snapshot) => {
    onChildRemoved(allCoinsRef, (snapshot) => {  
      const {x,y} = snapshot.val();
      const keyToRemove = getKeyString(x,y);
      gameContainer.removeChild( coinElements[keyToRemove] );
      delete coinElements[keyToRemove];
    })


    //Updates player name with text input
    playerNameInput.addEventListener("change", (e) => {
      const newName = e.target.value || createName();
      playerNameInput.value = newName;
      //playerRef.update({
      //  name: newName
      //})
      update(playerRef, { name: newName });
    })

    //Update player color on button click
    playerColorButton.addEventListener("click", () => {
      const mySkinIndex = playerColors.indexOf(players[playerId].color);
      const nextColor = playerColors[mySkinIndex + 1] || playerColors[0];
      //playerRef.update({
      //  color: nextColor
      //})
      update(playerRef, { color: nextColor });
    })

    outlineSubgrids();

    //Place my first coin
    placeCoin();

  }

  onAuthStateChanged(auth, (user) => {
    console.log(user);
    if (user) {
        // User is logged in
        playerId = user.uid;
        playerRef = ref(database, `players/${playerId}`);
        const lastOrderRef = ref(database, 'lastPlayerOrder');

        // Check the last player order and decide the current order
        get(lastOrderRef).then(lastOrderSnapshot => {
            let currentOrder = 0; // Default to 0 if lastPlayerOrder doesn't exist
            if (lastOrderSnapshot.exists()) {
                // Toggle the order based on the last player's order
                currentOrder = lastOrderSnapshot.val() === 0 ? 1 : 0;
            }

            // Set up the new player with the determined order
            const name = createName(); // Assume this function generates a random name
            playerNameInput.value = name;
            const {x, y} = getRandomSafeSpot(); // Assume this function determines positions safely

            set(playerRef, {
                id: playerId,
                name,
                direction: "right",
                color: randomFromArray(playerColors),
                oldX: x,
                oldY: y,
                x,
                y,
                coins: 0,
                order: currentOrder,
            }).then(() => {
                console.log(`Player ${playerId} added with order ${currentOrder}.`);
                // Update lastPlayerOrder in Firebase
                set(lastOrderRef, currentOrder);
            }).catch(error => {
                console.error("Error setting player data:", error);
            });

            // Remove player from Firebase when they disconnect
            onDisconnect(playerRef).remove();

            // Begin the game
            initGame();
            initGameDoors(); 
            fetchAndDrawDoors();// Assume this function initializes the game environment
        }).catch(error => {
            console.error("Error retrieving last player order:", error);
        });
    } else {
        // User is logged out
        console.log("User is logged out.");
        // Handle logout scenario if needed
    }
});


  signInAnonymously(auth)
  .then((userCredential) => {
    // User is signed in anonymously
    // userCredential.user provides the signed-in user's information
  })
  .catch((error) => {
    const errorCode = error.code;
    const errorMessage = error.message;
    // Handle errors here
    console.log(errorCode, errorMessage);
  });


})();
