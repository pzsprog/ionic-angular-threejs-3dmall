import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';

import { NavController } from '@ionic/angular';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import TWEEN from '@tweenjs/tween.js';
import { Camera } from 'three';

const enum Direction {
  Up = 1, // lépés felfelé, a tömb vége felé
  Down = -1, // lépés lefelé, a tömb elejére
}

// van kiválasztott emelet és az összes többi, minden emelet váltáskor az összes 'area'-t átszinezi
const levelColorDefault = 'bdbdbd';
const levelColorSelected = '8b8b8b';
// 'area' szinek, amelyikre éppen rákattintott (tap-elt) és az alapértelmzett szín.
const hexAreaDefaultColor = 0x8b8b8b;
const hexAreaSelectedColor = 0x003caf;

@Component({
  selector: 'app-building3d',
  templateUrl: './building3d.component.html',
  styleUrls: ['./building3d.component.css'],
})
export class Building3dComponent implements OnInit {
  @ViewChild('canvas', { static: true }) canvasEl: ElementRef;
  @HostListener('window:keyup', ['$event'])
  keyEvent(event: KeyboardEvent) {
    if (event.key == 'ArrowDown') {
      this.changeFloor(Direction.Down);
    }
    if (event.key == 'ArrowUp') {
      this.changeFloor(Direction.Up);
    }
  }

  private _ELEMENT: any;
  private _SCENE;
  private _CAMERA;
  public renderer;
  private _CONTROLS: any;
  public _FLOORS: Array<any>;
  public _AREAS: Array<any>;
  public _LABELS: Array<any>;
  private infotext: string = '';
  private levelinfo: string = 'empty';
  private selectedFloorIndex: number = 0;
  private touchX;
  private touchY;
  private _MOUSE; // = new THREE.Vector2();
  private _RAYCASTER; // = new THREE.Raycaster();
  private intersects = [];
  private zoomDist;
  private areaSelected: any = undefined;
  private areaSelectedColor = new THREE.Color(hexAreaSelectedColor);
  private areaDefaultColor = new THREE.Color(hexAreaDefaultColor);
  private areaSelectedEnergyMeter: number;
  private areaSelectedTempMeter: number;

  constructor(public navCtrl: NavController) {
    //this.mouse = new THREE.Vector2();
    //this.raycaster = new THREE.Raycaster();
  }

  ngOnInit() {
    this.initialiseWebGLObjectAndEnvironment();
    this.renderAnimation();
  }

  // scroll-ok eltünetetése (mivel a canvas-t a threejs hozza létre, a style-t 'ár kell apply-zni' külön)
  ngAfterViewInit() {
    (document.querySelector('canvas') as HTMLElement).style.display = 'block';
  }

  /**
   * Initialise the WebGL objecty to be generated using
   * selected ThreeJS methods and properties
   *
   * @public
   * @method initialiseWebGLObjectAndEnvironment
   * @return {none}
   */
  initialiseWebGLObjectAndEnvironment(): void {
    // Reference the DOM element that the WebGL generated object
    // will be assigned to
    this._ELEMENT = this.canvasEl.nativeElement;

    // Define a new ThreeJS scene
    this._SCENE = new THREE.Scene();

    this._MOUSE = new THREE.Vector2();
    this._RAYCASTER = new THREE.Raycaster();

    this._CAMERA = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this._CAMERA.position.set(0, 7, 7);
    //this._CAMERA.lookAt(this._SCENE.position);

    // Orbitcontrols
    const controls = (this._CONTROLS = new OrbitControls(
      this._CAMERA,
      this._ELEMENT
    ));
    //controls.target.set(0, 0, 0);
    controls.minPolarAngle = controls.maxPolarAngle = Math.PI / 4;
    controls.minDistance = 5;
    controls.maxDistance = 15;
    //controls.minZoom = 0.5; // only OrthographicCamera
    //controls.maxZoom = 2.0; // only OrthographicCamera
    controls.enablePan = false;
    // a 'zoom' távolságot 'init'-nél is be kell állítani, mert a szintek láthatóságát ez (is) befolyásolja
    this.zoomDist = this._CAMERA.position.distanceTo({ x: 0, y: 0, z: 0 });
    controls.addEventListener('change', () => {
      this.zoomDist = this._CAMERA.position.distanceTo({ x: 0, y: 0, z: 0 });
      this.toggleFloorVisibility();
    });
    // a forgatás után kicsit még 'lökje tovább' (impulzusmegmaradás)
    // Note that if this is enabled, you must call .update () in your animation loop.
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.update();

    // Define an object to manage display of ThreeJS scene
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    this.renderer.domElement.addEventListener(
      'touchstart',
      this.searchTarget.bind(this)
    );
    this.renderer.domElement.addEventListener(
      'click',
      this.searchTarget.bind(this)
    );

    // ablak ujraméretezés
    window.addEventListener('resize', this.onWindowResize.bind(this), false);

    // Resizes the output canvas to match the supplied width/height parameters
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Attach the canvas, where the renderer draws the scene, to the specified DOM element
    this.renderer.domElement;
    this._ELEMENT.appendChild(this.renderer.domElement);

    // Load GLTF model
    let loader = new GLTFLoader();
    this._FLOORS = [];
    this._AREAS = [];
    this._LABELS = [];

    const modelpath = '../../assets/models/';
    const defaultColor = '#e6f2ff';

    // let light = new THREE.AmbientLight( 0x404040 );
    // light.castShadow = true;
    // this._SCENE.add( light );
    var spotLight = new THREE.SpotLight(0xffffff, 1);
    spotLight.position.set(500, 400, 200);
    spotLight.angle = 0.4;
    spotLight.penumbra = 0.05;
    spotLight.decay = 1;
    spotLight.distance = 2000;
    spotLight.castShadow = true;
    this._SCENE.add(spotLight);
    spotLight.target.position.set(0, 0, 0);
    this._SCENE.add(spotLight.target);

    // 2d sprite-ok betöltése
    const textureLoader = new THREE.TextureLoader();
    let spriteMaterials = [];
    for (let i = 0; i < 10; i++) {
      let spriteMaterial = new THREE.SpriteMaterial({
        map: textureLoader.load(`../../assets/markers/marker_${i}.png`),
        depthTest: false,
      });
      spriteMaterials.push(spriteMaterial);
    }

    ['m1', 'm2', 'm3'].forEach((val, key) => {
      loader.load(modelpath + val + '.gltf', (gltf) => {
        let floor = gltf.scene;
        this._FLOORS.push(floor);
        floor.children.forEach((area) => {
          // console.log(area);
          // Math.random() * 0xffffff // 0x0080ff
          let color = new THREE.Color(defaultColor);
          area.material = new THREE.MeshStandardMaterial({
            color: defaultColor,
            opacity: 1.0,
            transparent: true,
            emissive: defaultColor,
          });
          // 2D sptite-ok elkészítése
          let randomSpriteIndex = Math.floor(Math.random() * Math.floor(10));
          let sprite = this.makeSprite(
            spriteMaterials[randomSpriteIndex],
            area
          );
          this._LABELS.push({ parent: area, label: sprite });
          this._SCENE.add(sprite);
          // 'szoba' (area) elkészítése
          //area.geometry.computeFaceNormals();
          area.geometry.computeVertexNormals();
          //area.material.emissive.set(color);
          area.floorIndex = key;
          area.roomIndex = area.name;
          area.label = sprite;
          this._AREAS.push(area);
        });
        this._SCENE.add(floor); // group
        this.selectedFloorIndex = this._FLOORS.length - 1;
        // kijelölt szint label update
        this.updateLevelInfoText(this.selectedFloorIndex + 1);
        // szintek szinezése
        this.updateFloorMaterials();
        // szintek pozicionálása
        this.updateFloorPositions();
      });
    });
  }

  makeSprite(material, parentMesh) {
    let sprite = new THREE.Sprite(material);
    let parentCenter = this.getCenterPoint(parentMesh);
    sprite.position.set(parentCenter.x, 0, parentCenter.z);
    sprite.scale.set(0.4, 0.4, 0.4);
    sprite.renderOrder = 1;

    return sprite;
  }

  getCenterPoint(mesh) {
    var geometry = mesh.geometry;
    geometry.computeBoundingBox();
    let center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    // magic..
    center.x += mesh.position.x;
    center.y += mesh.position.y;
    center.z += mesh.position.z;
    return center;
  }

  /**
   * Define the animation properties for the WebGL object rendered in the DOM element, using the requestAnimationFrame
   * method to animate the object
   *
   * @private
   * @method animate
   * @return {none}
   */
  private _animate(): void {
    requestAnimationFrame(() => {
      this._animate();
    });

    // this._FLOORS.forEach(floor => {
    //   floor.rotation.y += 0.001;
    // })

    TWEEN.update();
    this._CONTROLS.update();

    // Render the scene (will be called using the requestAnimationFrame method to ensure the cube is constantly animated)
    this.renderer.render(this._SCENE, this._CAMERA);
  }

  /**
   * Render the animation
   *
   * @public
   * @method _renderAnimation
   * @return {none}
   */
  renderAnimation(): void {
    //if (Detector.webgl)
    //{
    this._animate();
    /*}
    else {
       var warning = Detector.getWebGLErrorMessage();
       console.log(warning);
    }*/
  }

  // GLTF kiírása console-ra -> ÍGY: console.log(this.dumpObject(root).join('\n'));
  dumpObject(obj, lines = [], isLast = true, prefix = '') {
    const localPrefix = isLast ? '└─' : '├─';
    lines.push(
      `${prefix}${prefix ? localPrefix : ''}${obj.name || '*no-name*'} [${
        obj.type
      }]`
    );
    const newPrefix = prefix + (isLast ? '  ' : '│ ');
    const lastNdx = obj.children.length - 1;
    obj.children.forEach((child, ndx) => {
      const isLast = ndx === lastNdx;
      this.dumpObject(child, lines, isLast, newPrefix);
    });
    return lines;
  }

  searchTarget(event) {
    //event.preventDefault();
    //if (event.cancelable) event.preventDefault();

    // mivel a touch-nak es a click-nek is van clientX, clientY property-je
    let input;
    if (event.type === 'touchstart') {
      input = event.touches[0] || event.changedTouches[0]; // touchstart
    } else {
      input = event; // click
    }

    let X = input.clientX;
    let Y = input.clientY;
    let realTarget = document.elementFromPoint(X, Y);
    let calcOffsetX = X - realTarget.getBoundingClientRect().x;
    let calcOffsetY = Y - realTarget.getBoundingClientRect().y;

    let camera = this._CAMERA;
    let mouse = this._MOUSE;
    let raycaster = this._RAYCASTER;

    // mouse <- THREE.Vector2
    mouse.x = (calcOffsetX / window.innerWidth) * 2 - 1;
    mouse.y = -(calcOffsetY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    let intersects = raycaster.intersectObjects(this._AREAS);
    if (intersects.length > 0) {
      let selectedGroupId = this._FLOORS[this.selectedFloorIndex].uuid;
      intersects.forEach((element) => {
        let room = element.object;
        let objectGroupId = room.parent.uuid;
        if (objectGroupId === selectedGroupId) {
          this.selectArea(room);
        }
      });
    }
  }

  // szinezze át a 'szinteket'
  updateFloorMaterials(): void {
    this._FLOORS.forEach((floor, key) => {
      let floorIndex = Number(key);
      let floorSelected = floorIndex === this.selectedFloorIndex;
      let color = floorSelected
        ? `#${levelColorSelected}`
        : `#${levelColorDefault}`;
      let opacity = floorIndex !== this.selectedFloorIndex ? 0.6 : 1.0;
      floor.children.forEach((area) => {
        area.material.emissive.set(color);
        area.material.opacity = opacity;
        area.label.visible = floorSelected;
      });
    });
  }

  updateFloorPositions(): void {
    const defaultY = 1.0;
    const distance = 2.0;
    let f = this.updateLabelPositions;
    this._FLOORS.forEach((floor, key) => {
      let newY = defaultY + (Number(key) - this.selectedFloorIndex) * distance;
      floor.children.forEach((area) => {
        let newPositionVec3 = new THREE.Vector3(
          area.position.x,
          newY,
          area.position.z
        );
        this.animateVector3(area.position, newPositionVec3, {
          duration: 400,
          // http://sole.github.io/tween.js/examples/03_graphs.html
          easing: TWEEN.Easing.Quadratic.Out,
          update: function (d) {
            area.label.position.y = area.position.y + 0.1;
            //console.log("Updating: " + d);
          },
          callback: function () {
            //console.log("Completed");
          },
        });
      });
    });
  }

  updateAreaAnimations(): void {
    this._FLOORS.forEach((floor, key) => {
      floor.children.forEach((area) => {
        if (area.userData.hasOwnProperty('tweenColor')) {
          area.userData.tweenColor.stop();
        }
      });
    });
  }

  updateLabelPositions() {
    this._LABELS.forEach((element) => {
      element.label.position.y += element.parent.position.y;
    });
  }

  changeFloor(d: Direction): void {
    let newIndex = this.selectedFloorIndex + d; // +1, -1
    if (newIndex < 0 || newIndex >= this._FLOORS.length) {
      return;
    }
    this.selectedFloorIndex = newIndex;
    this.infotext = '';
    this.areaSelected = undefined;
    this.updateLevelInfoText(this.selectedFloorIndex + 1);
    this.updateAreaAnimations();
    this.updateFloorMaterials();
    this.updateFloorPositions();
    this.toggleFloorVisibility();
  }

  moveUpDisabled(): boolean {
    return this.selectedFloorIndex >= this._FLOORS.length - 1;
  }

  moveDownDisabled(): boolean {
    return this.selectedFloorIndex === 0;
  }

  moveUp() {
    this.changeFloor(Direction.Up);
  }

  moveDown() {
    this.changeFloor(Direction.Down);
  }

  onSwipeUp(event) {
    this.changeFloor(Direction.Down);
  }

  onSwipeDown(event) {
    this.changeFloor(Direction.Up);
  }

  // animation
  animateVector3(vectorToAnimate, target, options) {
    //console.log(vectorToAnimate);
    //console.log(target);

    options = options || {}; // get targets from options or set to defaults
    let easing = options.easing || TWEEN.Easing.Quadratic.In;
    let duration = options.duration || 2000; // create the tween
    let tweenVector3 = new TWEEN.Tween(vectorToAnimate)
      .to({ x: target.x, y: target.y, z: target.z }, duration)
      .easing(easing)
      .onUpdate(function (d) {
        if (options.update) {
          options.update(d);
        }
      })
      .onComplete(function () {
        if (options.callback) options.callback();
      }); // start the tween
    tweenVector3.start(); // return the tween in case we want to manipulate it later on
    //console.log(tweenVector3);
    return tweenVector3;
  }

  toggleFloorVisibility() {
    this._FLOORS.forEach((floor, key) => {
      floor.visible = this.zoomDist > 7.0 || key <= this.selectedFloorIndex;
    });
  }

  animateColor(model) {
    let delta = { color: new THREE.Color(hexAreaDefaultColor) };
    let defaultColor = this.areaDefaultColor;
    model.userData.tweenColor = new TWEEN.Tween(delta)
      .to({ color: new THREE.Color(hexAreaSelectedColor) }, 1000)
      .easing(TWEEN.Easing.Cubic.InOut) // https://sole.github.io/tween.js/examples/03_graphs.html
      .onUpdate(function () {
        model.material.emissive.set(new THREE.Color(delta.color));
      })
      .onStop(function () {
        model.material.emissive.set(defaultColor);
      })
      .yoyo(true)
      .repeat(Infinity)
      .start();
  }

  updateLevelInfoText(n) {
    this.levelinfo = 'Szint: ' + n + ' / ' + this._FLOORS.length;
  }

  selectArea(area): void {
    if (this.areaSelected === area) {
      return;
    }
    // csak akkor kell átszinezni, ha ugyanazon a szinten vannak
    if (
      this.areaSelected !== undefined &&
      area.parent.uuid === this.areaSelected.parent.uuid
    ) {
      this.areaSelected.userData.tweenColor.stop();
    }
    this.animateColor(area);
    this.areaSelected = area;
  }

  onWindowResize() {
    this._CAMERA.aspect = window.innerWidth / window.innerHeight;
    this._CAMERA.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
} // class end
